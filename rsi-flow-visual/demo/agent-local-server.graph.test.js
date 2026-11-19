'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

const filename = path.join(__dirname, 'agent-local-server.js');
const source = fs.readFileSync(filename, 'utf8');
const agent = id => ({ id, role: `role ${id}`, model: 'test',
  apiUrl: 'https://example.com/v1/chat/completions', apiKey: 'dummy' });
const input = {
  objective: 'complete project', maxRevisions: 1, supervisor: agent('supervisor'),
  workers: [agent('start'), agent('yes'), agent('no')],
  workerGraph: { roots: ['start'], branches: [{ id: 'decision', sourceWorkerId: 'start',
    condition: 'upstream output signals ready', ifWorkerId: 'yes', elseWorkerId: 'no' }] }
};

function makeWorkflow({ takeIf, retry = false, groupOutput = false, retryTaskId = 'initial',
  repeat = true, rejectReviews = 0, deferChildren = false, failChild = null } = {}) {
  const calls = [];
  const deferred = new Map();
  let reviewCount = 0;
  const fakeHttps = { request(url, options, respond) {
    const request = new EventEmitter();
    request.destroy = error => request.emit('error', error);
    request.end = body => {
      const data = JSON.parse(body);
      const system = data.messages[0].content;
      const user = data.messages[1].content;
      const id = options.headers.Authorization.slice('Bearer '.length);
      calls.push({ system, user, id });
      let content;
      if (system.includes('Assign exactly one task to each root worker ID')) {
        content = JSON.stringify({ tasks: [{ id: 'initial', workerId: 'start', instruction: 'start work' }] });
      } else if (system.includes('supervisor routing a worker result')) {
        content = JSON.stringify({ takeIf: groupOutput ? user.includes('Upstream output: internal last') : takeIf,
          rationale: 'condition inspected upstream output' });
      } else if (system.includes('evaluating a loop condition')) {
        content = JSON.stringify({ repeat, rationale: 'checked' });
      } else if (system.includes('name only executed task IDs to retry')) {
        reviewCount++;
        content = JSON.stringify((retry && reviewCount === 1) || reviewCount <= rejectReviews
          ? { approved: false, feedback: 'rework', retryTaskIds: [retryTaskId], finalAnswer: null }
          : { approved: true, feedback: 'accepted', retryTaskIds: [], finalAnswer: 'complete' });
      } else {
        content = system.includes('role start') ? 'ready signal' :
          system.includes('role first') ? 'internal first' :
          system.includes('role last') ? 'internal last' :
          system.includes('role child') ? `output ${system.match(/role (child\d+)/)[1]}` :
          `downstream ${system.match(/role (yes|no)/)[1]}`;
      }
      const response = new EventEmitter();
      response.statusCode = 200;
      response.headers = {};
      respond(response);
      const finish = () => process.nextTick(() => {
        if (failChild && system.includes(`role ${failChild}`)) {
          request.emit('error', Object.assign(new Error('mock network error'), { code: 'MOCK_FAILURE' }));
          return;
        }
        response.emit('data', Buffer.from(JSON.stringify({ choices: [{ message: { content } }] })));
        response.emit('end');
      });
      if (deferChildren && /role child\d+/.test(system)) {
        deferred.set(system.match(/role (child\d+)/)[1], finish);
      } else finish();
    };
    return request;
  } };
  const context = { require(id) {
    if (id === 'node:https') return fakeHttps;
    if (id === 'node:http') return { createServer: () => ({ listen() {} }) };
    return require(id);
  }, module: { exports: {} }, __dirname, console, process, Buffer, URL };
  vm.runInNewContext(source, context, { filename });
  return { workflow: context.module.exports.workflow, validate: context.module.exports.validate, calls, deferred };
}

(async () => {
  for (const takeIf of [true, false]) {
    const { workflow, calls } = makeWorkflow({ takeIf });
    const result = await workflow(input);
    const selected = takeIf ? 'yes' : 'no';
    assert.deepEqual(Array.from(result.results, result => result.workerId), ['start', selected]);
    assert.equal(result.routeTrace.length, 1);
    assert.equal(result.routeTrace[0].selectedWorkerId, selected);
    assert.equal(result.routeTrace[0].rationale, 'condition inspected upstream output');
    assert.equal(result.approved, true);
    assert.ok(calls.some(call => call.user.includes('Preceding worker output: ready signal') &&
      call.system.includes(`role ${selected}`)));
    assert.equal(calls.filter(call => call.system.includes('You are a worker.')).length, 2);
    assert.ok(calls.some(call => call.user.includes('"workerId":"' + selected + '"')));
  }
  const retry = makeWorkflow({ takeIf: true, retry: true });
  const retried = await retry.workflow(input);
  assert.equal(retried.revisions, 1);
  assert.deepEqual(Array.from(retried.results, result => result.attempt), [2, 2]);
  assert.equal(retried.routeTrace.length, 2);
  assert.equal(retry.calls.filter(call => call.system.includes('You are a worker.')).length, 4);

  const grouped = { ...input, workers: [agent('start'), agent('first'), agent('last'), agent('yes'), agent('no')],
    workerGraph: { ...input.workerGraph, groups: [{ id: 'sequence', sourceWorkerId: 'start',
      workerIds: ['first', 'last'] }] } };
  const group = makeWorkflow({ takeIf: true, groupOutput: true });
  const groupedResult = await group.workflow(grouped);
  assert.deepEqual(Array.from(groupedResult.results, result => result.workerId),
    ['start', 'first', 'last', 'yes']);
  assert.deepEqual(Array.from(groupedResult.results, result => result.output),
    ['ready signal', 'internal first', 'internal last', 'downstream yes']);
  assert.ok(group.calls.some(call => call.system.includes('role first') &&
    call.user.includes('Preceding worker output: ready signal')));
  assert.ok(group.calls.some(call => call.system.includes('role last') &&
    call.user.includes('Preceding worker output: internal first')));
  assert.ok(group.calls.some(call => call.system.includes('supervisor routing a worker result') &&
    call.user.includes('Upstream output: internal last')));
  assert.ok(group.calls.some(call => call.system.includes('role yes') &&
    call.user.includes('Preceding worker output: internal last')));
  assert.ok(group.calls.some(call => call.system.includes('name only executed task IDs to retry') &&
    call.user.includes('"workerId":"last"')));
  const groupRetry = makeWorkflow({ takeIf: false, retry: true, retryTaskId: 'routed-2' });
  const groupedRetry = await groupRetry.workflow(grouped);
  assert.equal(groupedRetry.revisions, 1);
  assert.deepEqual(Array.from(groupedRetry.results, result => result.attempt), [2, 2, 2, 2]);
  assert.equal(groupRetry.calls.filter(call => call.system.includes('You are a worker.')).length, 8);
  const nestedBranch = { ...grouped, workerGraph: { roots: ['start'],
    branches: [{ id: 'decision', sourceWorkerId: 'start', condition: 'ready',
      ifWorkerId: 'yes', elseWorkerId: 'no' }],
    groups: [{ id: 'sequence', sourceWorkerId: 'yes', workerIds: ['first', 'last'] }] } };
  const branchGroup = await makeWorkflow({ takeIf: true }).workflow(nestedBranch);
  assert.deepEqual(Array.from(branchGroup.results, result => result.workerId),
    ['start', 'first', 'last', 'yes']);

  const chain = { ...input, workers: [agent('start'), agent('first'), agent('last')],
    maxRevisions: 2, workerGraph: { roots: ['start'], branches: [], sequences: [
      { id: 's1', sourceWorkerId: 'start', targetWorkerId: 'first' },
      { id: 's2', sourceWorkerId: 'first', targetWorkerId: 'last' }] } };
  const ordered = makeWorkflow();
  const orderedResult = await ordered.workflow(chain);
  assert.deepEqual(Array.from(orderedResult.executionTrace.filter(event => event.type === 'worker'),
    event => event.workerId), ['start', 'first', 'last']);
  assert.ok(ordered.calls.some(call => call.system.includes('role first') &&
    call.user.includes('Preceding worker output: ready signal')));
  const looped = { ...chain, workerGraph: { ...chain.workerGraph,
    loops: [{ id: 'again', sourceWorkerId: 'last', targetWorkerId: 'first', maxIterations: 2 }] } };
  const workerLoop = await makeWorkflow().workflow(looped);
  assert.deepEqual(Array.from(workerLoop.executionTrace.filter(event => event.type === 'worker'),
    event => event.workerId), ['start', 'first', 'last', 'first', 'last', 'first', 'last']);
  assert.deepEqual(Array.from(workerLoop.executionTrace.filter(event => event.type === 'loop'),
    event => event.taken), [true, true, false]);
  const conditional = await makeWorkflow({ repeat: false }).workflow({ ...looped,
    workerGraph: { ...looped.workerGraph, loops: [{ ...looped.workerGraph.loops[0], condition: 'repeat?' }] } });
  assert.equal(conditional.executionTrace.filter(event => event.type === 'worker').length, 3);
  const supervisorLoop = await makeWorkflow({ rejectReviews: 1 }).workflow({ ...looped,
    workerGraph: { ...looped.workerGraph, loops: [{ ...looped.workerGraph.loops[0],
      targetWorkerId: 'supervisor', maxIterations: 1 }] } });
  assert.equal(supervisorLoop.reviews.length, 2);
  assert.equal(supervisorLoop.executionTrace.filter(event => event.type === 'worker').length, 6);
  const groupedSequence = { ...grouped, workers: [agent('start'), agent('first'),
    agent('last'), agent('yes')], workerGraph: { roots: ['start'], branches: [],
    groups: grouped.workerGraph.groups,
    sequences: [{ id: 'tail', sourceWorkerId: 'last', targetWorkerId: 'yes' }] } };
  const groupedTail = await makeWorkflow().workflow(groupedSequence);
  assert.deepEqual(Array.from(groupedTail.executionTrace.filter(event => event.type === 'worker'),
    event => event.workerId), ['start', 'first', 'last', 'yes']);
  assert.ok(groupedTail.executionTrace.some(event => event.type === 'sequence' &&
    event.sourceWorkerId === 'last' && event.targetWorkerId === 'yes'));
  const internalSequence = { ...groupedSequence, workers: [...groupedSequence.workers, agent('no')],
    workerGraph: { ...groupedSequence.workerGraph, sequences: [
      { id: 'internal', sourceWorkerId: 'first', targetWorkerId: 'no' },
      ...groupedSequence.workerGraph.sequences ] } };
  const routedInternal = await makeWorkflow().workflow(internalSequence);
  assert.deepEqual(Array.from(routedInternal.executionTrace.filter(event => event.type === 'worker'),
    event => event.workerId), ['start', 'first', 'no', 'last', 'yes']);
  assert.ok(routedInternal.results.find(result => result.workerId === 'last'));
  const internalBranch = { ...grouped, workerGraph: { ...grouped.workerGraph,
    branches: [{ id: 'inner', sourceWorkerId: 'first', condition: 'ready', ifWorkerId: 'yes', elseWorkerId: 'no' }] } };
  const routedGroupBranch = await makeWorkflow({ takeIf: true }).workflow(internalBranch);
  assert.deepEqual(Array.from(routedGroupBranch.executionTrace.filter(event => event.type === 'worker'),
    event => event.workerId), ['start', 'first', 'yes', 'last']);
  assert.ok(routedGroupBranch.routeTrace.some(event => event.sourceWorkerId === 'first'));
  const internalLoop = { ...groupedSequence, workerGraph: { ...groupedSequence.workerGraph,
    loops: [{ id: 'repeat-member', sourceWorkerId: 'yes', targetWorkerId: 'first', maxIterations: 1 }] } };
  const reroutedGroup = await makeWorkflow().workflow(internalLoop);
  assert.deepEqual(Array.from(reroutedGroup.executionTrace.filter(event => event.type === 'worker'),
    event => event.workerId), ['start', 'first', 'last', 'yes', 'first', 'last', 'yes']);
  const { validate } = makeWorkflow({ takeIf: true });
  assert.throws(() => validate({ ...looped, workerGraph: { ...looped.workerGraph,
    loops: [{ ...looped.workerGraph.loops[0], targetWorkerId: 'no' }] } }), /loops/);
  assert.throws(() => validate({ ...looped, workerGraph: { ...looped.workerGraph,
    loops: [{ ...looped.workerGraph.loops[0], maxIterations: 3 }] } }), /loops/);
  assert.throws(() => validate({ ...chain, workerGraph: { ...chain.workerGraph,
    sequences: [...chain.workerGraph.sequences, { id: 'cycle', sourceWorkerId: 'last', targetWorkerId: 'start' }] } }), /sequences|acyclic/);
  assert.throws(() => validate({ ...chain, workerGraph: { ...chain.workerGraph,
    sequences: [...chain.workerGraph.sequences, { id: 'double', sourceWorkerId: 'start', targetWorkerId: 'last' }] } }), /sequences/);
  const invalid = branches => ({ ...input, workerGraph: { roots: ['start'], branches } });
  const original = input.workerGraph.branches[0];
  assert.throws(() => validate(invalid([{ ...original, ifWorkerId: 'missing' }])), /branches/);
  assert.throws(() => validate(invalid([{ ...original, ifWorkerId: 'start' }])), /entry workers/);
  assert.throws(() => validate(invalid([])), /reachable/);
  assert.throws(() => validate(invalid([original, { ...original, id: 'again', sourceWorkerId: 'yes' }])), /incoming branch/);
  assert.throws(() => validate(invalid([{ ...original, condition: '' }])), /branches/);
  const invalidGroup = groups => ({ ...grouped, workerGraph: { ...grouped.workerGraph, groups } });
  const baseGroup = grouped.workerGraph.groups[0];
  assert.throws(() => validate(invalidGroup([{ ...baseGroup, workerIds: ['first', 'first'] }])), /Group members/);
  assert.throws(() => validate(invalidGroup([{ ...baseGroup, workerIds: ['yes'] }])), /Group members/);
  assert.throws(() => validate(invalidGroup([{ ...baseGroup, workerIds: ['start'] }])), /Group members/);
  assert.throws(() => validate(invalidGroup([{ ...baseGroup, workerIds: ['missing'] }])), /Group members/);
  assert.throws(() => validate(invalidGroup([{ ...baseGroup, workerIds: [] }])), /groups/);
  assert.throws(() => validate(invalidGroup([baseGroup, { ...baseGroup, id: 'other' }])), /groups/);
  assert.throws(() => validate(invalidGroup([baseGroup, { id: 'other', sourceWorkerId: 'last',
    workerIds: ['start'] }])), /Group members/);
  assert.throws(() => validate({ ...grouped, workerGraph: { ...grouped.workerGraph,
    branches: [...grouped.workerGraph.branches, { id: 'other', sourceWorkerId: 'first',
      condition: 'ready', ifWorkerId: 'last', elseWorkerId: 'no' }] } }), /incoming branch/);
  const parallelGraph = { roots: ['start'], branches: [],
    parallels: [{ id: 'fork', sourceWorkerId: 'start', workerIds: ['child1', 'child2'] }] };
  const forkInput = { ...input, workers: [agent('start'), agent('child1'), agent('child2')],
    workerGraph: parallelGraph };
  const concurrent = makeWorkflow({ deferChildren: true });
  const active = concurrent.workflow(forkInput);
  for (let index = 0; index < 10 && concurrent.deferred.size < 2; index++) await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual([...concurrent.deferred.keys()], ['child1', 'child2'],
    'both child calls must start before either response completes');
  concurrent.deferred.get('child2')();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(concurrent.calls.some(call => call.system.includes('name only executed task IDs to retry')), false,
    'supervisor must wait for both arms to join');
  concurrent.deferred.get('child1')();
  const joined = await active;
  assert.deepEqual(Array.from(joined.results, result => result.workerId), ['start', 'child1', 'child2']);
  assert.equal(joined.executionTrace.find(event => event.type === 'parallel-join').output,
    JSON.stringify([{ workerId: 'child1', output: 'output child1' },
      { workerId: 'child2', output: 'output child2' }]));
  assert.deepEqual(Array.from(joined.executionTrace.filter(event => event.type === 'worker'),
    event => event.workerId), ['start', 'child2', 'child1']);
  assert.ok(concurrent.calls.filter(call => /role child\d+/.test(call.system)).every(call =>
    call.user.includes('Preceding worker output: ready signal')));
  const failedFork = makeWorkflow({ deferChildren: true, failChild: 'child1' });
  const failedRun = failedFork.workflow(forkInput);
  for (let index = 0; index < 10 && failedFork.deferred.size < 2; index++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(failedFork.deferred.size, 2);
  let failureSettled = false;
  const failure = assert.rejects(failedRun, /Agent API request failed \(MOCK_FAILURE\)/)
    .then(() => { failureSettled = true; });
  failedFork.deferred.get('child1')();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(failureSettled, false, 'failed fork must wait for its other in-flight child');
  failedFork.deferred.get('child2')();
  await failure;
  assert.equal(failedFork.calls.some(call => call.system.includes('name only executed task IDs to retry')), false);
  const branchedFork = { ...forkInput, workers: [...forkInput.workers, agent('yes'), agent('no')],
    workerGraph: { ...parallelGraph, branches: [{ ...original, condition: 'join ready' }] } };
  const routedFork = await makeWorkflow({ takeIf: true }).workflow(branchedFork);
  assert.deepEqual(Array.from(routedFork.results, result => result.workerId),
    ['start', 'child1', 'child2', 'yes']);
  const joinedOutput = JSON.stringify([{ workerId: 'child1', output: 'output child1' },
    { workerId: 'child2', output: 'output child2' }]);
  assert.ok(routedFork.executionTrace.some(event => event.type === 'parallel-join' && event.output === joinedOutput));
  const forkRetry = makeWorkflow({ takeIf: true, retry: true, retryTaskId: 'routed-2' });
  const retriedFork = await forkRetry.workflow(branchedFork);
  assert.deepEqual(Array.from(retriedFork.results, result => result.attempt), [2, 2, 2, 2]);
  assert.equal(retriedFork.executionTrace.filter(event => event.type === 'parallel-fork').length, 2);
  assert.equal(forkRetry.calls.filter(call => call.system.includes('role child2')).length, 2);
  const afterJoin = { ...forkInput, workers: [...forkInput.workers, agent('yes')],
    workerGraph: { ...parallelGraph, sequences: [
      { id: 'post-join', sourceWorkerId: 'start', targetWorkerId: 'yes' }] } };
  const joinedSequence = makeWorkflow();
  const joinedSequenceResult = await joinedSequence.workflow(afterJoin);
  assert.deepEqual(Array.from(joinedSequenceResult.executionTrace.filter(event =>
    ['parallel-fork', 'parallel-join', 'sequence'].includes(event.type)), event => event.type),
  ['parallel-fork', 'parallel-join', 'sequence']);
  assert.ok(joinedSequence.calls.some(call => call.system.includes('role yes') &&
    call.user.includes(`Preceding worker output: ${joinedOutput}`)));
  const retriedJoin = makeWorkflow({ retry: true, retryTaskId: 'routed-1' });
  const retriedJoinResult = await retriedJoin.workflow(afterJoin);
  assert.deepEqual(Array.from(retriedJoinResult.results, result => result.attempt), [2, 2, 2, 2]);
  assert.equal(retriedJoinResult.executionTrace.filter(event => event.type === 'parallel-fork').length, 2);
  assert.equal(retriedJoinResult.executionTrace.filter(event => event.type === 'parallel-join').length, 2);
  assert.equal(retriedJoinResult.executionTrace.filter(event => event.type === 'sequence').length, 2);
  assert.equal(retriedJoin.calls.filter(call => call.system.includes('role yes')).length, 2);
  assert.ok(retriedJoin.calls.filter(call => call.system.includes('role yes')).every(call =>
    call.user.includes(`Preceding worker output: ${joinedOutput}`)));
  const withSequence = { ...forkInput, workers: [...forkInput.workers, agent('first')],
    workerGraph: { ...parallelGraph, sequences: [
      { id: 'arm-tail', sourceWorkerId: 'child1', targetWorkerId: 'first' }] } };
  const sequencedFork = await makeWorkflow().workflow(withSequence);
  assert.equal(sequencedFork.executionTrace.find(event => event.type === 'parallel-join').output,
    JSON.stringify([{ workerId: 'child1', output: 'internal first' },
      { workerId: 'child2', output: 'output child2' }]));
  const armBranchInput = { ...forkInput, workers: [...forkInput.workers, agent('yes'), agent('no')],
    workerGraph: { ...parallelGraph, branches: [{ id: 'arm-route', sourceWorkerId: 'child1',
      condition: 'ready', ifWorkerId: 'yes', elseWorkerId: 'no' }] } };
  const armBranch = await makeWorkflow({ takeIf: true }).workflow(armBranchInput);
  assert.deepEqual(Array.from(armBranch.results, result => result.workerId), ['start', 'child1', 'child2', 'yes']);
  assert.equal(armBranch.executionTrace.find(event => event.type === 'parallel-join').output,
    JSON.stringify([{ workerId: 'child1', output: 'downstream yes' },
      { workerId: 'child2', output: 'output child2' }]));
  const armLoopInput = { ...withSequence, workerGraph: { ...withSequence.workerGraph,
    loops: [{ id: 'arm-repeat', sourceWorkerId: 'first', targetWorkerId: 'child1', maxIterations: 1 }] } };
  const armLoop = await makeWorkflow().workflow(armLoopInput);
  assert.deepEqual(Array.from(armLoop.executionTrace.filter(event => event.type === 'worker' &&
    event.workerId !== 'start'), event => event.workerId), ['child1', 'child2', 'first', 'child1', 'first']);
  assert.deepEqual(Array.from(armLoop.executionTrace.filter(event => event.type === 'loop'),
    event => event.taken), [true, false]);
  const invalidParallel = parallels => ({ ...forkInput, workerGraph: { ...parallelGraph, parallels } });
  const baseParallel = parallelGraph.parallels[0];
  for (const workerIds of [[], ['child1'], ['child1', 'child1'], ['child1', 'missing'],
    ['start', 'child2']]) {
    assert.throws(() => validate(invalidParallel([{ ...baseParallel, workerIds }])), /parallel|entry workers/i);
  }
  assert.throws(() => validate(invalidParallel([baseParallel, { ...baseParallel, id: 'second' }])), /parallel/i);
  assert.throws(() => validate({ ...forkInput, workerGraph: { ...parallelGraph, sequences: [
    { id: 'duplicate', sourceWorkerId: 'start', targetWorkerId: 'child1' }] } }), /parallel|incoming/i);
  assert.throws(() => validate({ ...forkInput, workerGraph: { ...parallelGraph, groups: [
    { id: 'g', sourceWorkerId: 'start', workerIds: ['child1'] }] } }), /parallel|incoming/i);
  assert.throws(() => validate({ ...forkInput, workerGraph: { ...parallelGraph, loops: [
    { id: 'loop', sourceWorkerId: 'child1', targetWorkerId: 'start', maxIterations: 1 }] } }), /loops/i);
  const twelveWorkers = Array.from({ length: 12 }, (_, index) => agent(`worker-${index + 1}`));
  validate({ ...forkInput, workers: [agent('start'), ...Array.from({ length: 11 }, (_, i) => agent(`child${i + 1}`))],
    workerGraph: { roots: ['start'], branches: [], parallels: [{ id: 'max',
      sourceWorkerId: 'start', workerIds: Array.from({ length: 11 }, (_, i) => `child${i + 1}`) }] } });
  validate({ objective: 'limit check', maxRevisions: 0, supervisor: agent('supervisor'), workers: twelveWorkers });
  assert.throws(() => validate({ objective: 'limit check', maxRevisions: 0,
    supervisor: agent('supervisor'), workers: [...twelveWorkers, agent('worker-13')] }), /1..12/);
  assert.throws(() => validate({ ...grouped, workerGraph: { ...grouped.workerGraph, groups: {} } }), /groups/);
  console.log('Worker graph routing, groups, retries, and validation: OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
