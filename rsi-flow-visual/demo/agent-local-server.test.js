'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const filename = path.join(__dirname, 'agent-local-server.js');
const source = fs.readFileSync(filename, 'utf8');
const calls = [];
let reviews = 0;
const fakeHttps = {
  request(url, options, respond) {
    const request = new EventEmitter();
    request.destroy = error => request.emit('error', error);
    request.end = body => {
      const input = JSON.parse(body);
      calls.push(input.messages[1].content);
      let content;
      if (input.messages[0].content.includes('You are the supervisor. Return ONLY JSON: {"tasks"')) {
        content = JSON.stringify({ tasks: [{ id: 'task-1', workerId: 'worker-1', instruction: 'draft' }] });
      } else if (input.messages[0].content.includes('You are the supervisor. Return ONLY JSON: {"approved"')) {
        reviews++;
        content = JSON.stringify(reviews === 1
          ? { approved: false, feedback: 'revise', retryTaskIds: ['task-1'], finalAnswer: null }
          : { approved: true, feedback: 'done', retryTaskIds: [], finalAnswer: 'accepted' });
      } else {
        content = input.messages[1].content.includes('Step instruction:')
          ? `step ${input.messages[1].content.match(/Step instruction: ([^\n]+)/)[1]}` : 'main output';
      }
      const response = new EventEmitter();
      response.statusCode = 200;
      response.headers = {};
      respond(response);
      process.nextTick(() => {
        response.emit('data', Buffer.from(JSON.stringify({ choices: [{ message: { content } }] })));
        response.emit('end');
      });
    };
    return request;
  }
};
const fakeServer = { listen() {} };
const context = { require(id) {
  if (id === 'node:https') return fakeHttps;
  if (id === 'node:http') return { createServer: () => fakeServer };
  return require(id);
}, module: { exports: {} }, __dirname, console, process, Buffer, URL };
vm.runInNewContext(source, context, { filename });
const agent = id => ({ id, role: 'test', model: 'test', apiUrl: 'https://example.com/v1/chat/completions', apiKey: 'dummy' });
const input = {
  objective: 'draft', maxRevisions: 1, supervisor: agent('supervisor'), workers: [agent('worker-1')],
  workerSteps: { 'worker-1': [
    { id: 'nested', type: 'group', name: 'subflow', children: [
      { id: 'always', type: 'task', instruction: 'format' }
    ] },
    { id: 'branch', type: 'branch', condition: 'rejected', children: [
      { id: 'revise', type: 'task', instruction: 'revise' }
    ] }
  ] }
};
(async () => {
  const result = await context.module.exports.workflow(input);
  assert.equal(result.approved, true);
  assert.equal(result.revisions, 1);
  assert.equal(result.reviews.length, 2);
  assert.equal(result.results[0].output, 'step revise');
  assert.deepEqual(Array.from(result.results[0].steps, step => step.id), ['always', 'always', 'revise']);
  assert.deepEqual(Array.from(result.results[0].steps, step => step.attempt), [1, 2, 2]);
  assert.equal(calls.filter(call => call.includes('Step instruction: revise')).length, 1);
  assert.throws(() => context.module.exports.validate({ ...input, workerSteps: {
    'worker-1': [{ id: 'bad', type: 'branch', condition: 'approved', children: [] }]
  } }), /condition/);
  console.log('Worker nested steps and rejected branch: OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
