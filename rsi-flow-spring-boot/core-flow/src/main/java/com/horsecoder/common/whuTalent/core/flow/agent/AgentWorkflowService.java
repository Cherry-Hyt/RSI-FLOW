package com.horsecoder.common.whuTalent.core.flow.agent;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Service;

@Service
public class AgentWorkflowService {
    private final AgentModel model;

    public AgentWorkflowService(AgentModel model) {
        this.model = model;
    }

    public static final class RunState {
        private final AgentWorkflowService owner;
        private final AgentWorkflow.Request request;
        private final Map<String, AgentWorkflow.AgentConfig> workers;
        private final AgentWorkflow.Plan plan;
        private final Map<String, AgentWorkflow.Task> tasks;
        private final Map<String, AgentWorkflow.TaskResult> outputs = new HashMap<>();
        private List<String> pending = new ArrayList<>();
        private AgentWorkflow.Review review;
        private final AgentWorkflow.Response response = new AgentWorkflow.Response();
        private int round;
        private boolean done;

        private RunState(AgentWorkflowService owner, AgentWorkflow.Request request,
                         Map<String, AgentWorkflow.AgentConfig> workers,
                         AgentWorkflow.Plan plan, Map<String, AgentWorkflow.Task> tasks) {
            this.owner = owner;
            this.request = request;
            this.workers = workers;
            this.plan = plan;
            this.tasks = tasks;
            for (AgentWorkflow.Task task : plan.tasks) {
                pending.add(task.id);
            }
        }

        public void advance() {
            owner.advance(this);
        }

        public boolean isDone() {
            return done;
        }

        public AgentWorkflow.Response getResponse() {
            return response;
        }
    }

    public AgentWorkflow.Response run(AgentWorkflow.Request request) {
        RunState state = start(request);
        while (!state.isDone()) {
            advance(state);
        }
        return state.getResponse();
    }

    public RunState start(AgentWorkflow.Request request) {
        if (request == null || request.objective == null || request.objective.trim().isEmpty()
                || request.objective.length() > 4000 || request.maxRevisions < 0 || request.maxRevisions > 2
                || request.supervisor == null || request.workers == null
                || request.workers.isEmpty() || request.workers.size() > 12) {
            throw new IllegalArgumentException("Objective (max 4000 chars), supervisor and 1..12 workers are required; maxRevisions must be 0..2");
        }
        validateAgent(request.supervisor);
        Map<String, AgentWorkflow.AgentConfig> workers = new HashMap<>();
        for (AgentWorkflow.AgentConfig worker : request.workers) {
            validateAgent(worker);
            if (workers.putIfAbsent(worker.id, worker) != null || request.supervisor.id.equals(worker.id)) {
                throw new IllegalArgumentException("Agent IDs must be unique");
            }
        }
        AgentWorkflow.Plan plan = model.plan(request.supervisor, request.objective,
                Collections.unmodifiableList(new ArrayList<>(request.workers)));
        if (plan == null || plan.tasks == null || plan.tasks.size() != request.workers.size()) {
            throw new IllegalArgumentException("Supervisor must assign one task to each worker");
        }
        Map<String, AgentWorkflow.Task> tasks = new HashMap<>();
        Set<String> assigned = new HashSet<>();
        for (AgentWorkflow.Task task : plan.tasks) {
            if (task == null || task.id == null || !task.id.matches("[a-zA-Z0-9_-]{1,40}")
                    || task.instruction == null || task.instruction.trim().isEmpty()
                    || task.instruction.length() > 4000 || !workers.containsKey(task.workerId)
                    || tasks.putIfAbsent(task.id, task) != null || !assigned.add(task.workerId)) {
                throw new IllegalArgumentException("Invalid supervisor task plan");
            }
        }
        return new RunState(this, request, workers, plan, tasks);
    }

    public void advance(RunState state) {
        if (state == null || state.done) {
            throw new IllegalStateException("Agent run is not active");
        }
        for (String id : state.pending) {
            AgentWorkflow.Task task = state.tasks.get(id);
            AgentWorkflow.TaskResult previous = state.outputs.get(id);
            String result = model.work(state.workers.get(task.workerId), state.request.objective, task,
                    state.review == null ? null : state.review.feedback,
                    previous == null ? null : previous.output);
            if (result == null || result.trim().isEmpty()) {
                throw new IllegalStateException("Worker returned an empty result: " + id);
            }
            state.outputs.put(id, new AgentWorkflow.TaskResult(task, result, state.round + 1));
        }
        state.response.results.clear();
        for (AgentWorkflow.Task task : state.plan.tasks) {
            state.response.results.add(state.outputs.get(task.id));
        }
        state.review = model.review(state.request.supervisor, state.request.objective,
                Collections.unmodifiableList(new ArrayList<>(state.response.results)));
        if (state.review == null) {
            throw new IllegalStateException("Supervisor review is missing");
        }
        state.response.approved = state.review.approved;
        state.response.feedback = state.review.feedback;
        state.response.answer = state.review.approved ? state.review.finalAnswer : null;
        state.response.revisions = state.round;
        if (state.review.approved) {
            if (state.response.answer == null || state.response.answer.trim().isEmpty()) {
                throw new IllegalStateException("Approved review must contain a final answer");
            }
            state.done = true;
            return;
        }
        if (state.round == state.request.maxRevisions) {
            state.done = true;
            return;
        }
        if (state.review.retryTaskIds == null || state.review.retryTaskIds.isEmpty()
                || new HashSet<>(state.review.retryTaskIds).size() != state.review.retryTaskIds.size()) {
            throw new IllegalStateException("Rejected review must name distinct tasks to retry");
        }
        for (String id : state.review.retryTaskIds) {
            if (!state.tasks.containsKey(id)) {
                throw new IllegalStateException("Supervisor requested an unknown task: " + id);
            }
        }
        state.pending = new ArrayList<>(state.review.retryTaskIds);
        state.round++;
    }

    private void validateAgent(AgentWorkflow.AgentConfig agent) {
        if (agent == null || agent.id == null || !agent.id.matches("[a-zA-Z0-9_-]{1,40}")
                || agent.role == null || agent.role.trim().isEmpty() || agent.role.length() > 500) {
            throw new IllegalArgumentException("Each agent requires an ID and role (max 500 chars)");
        }
        model.validate(agent);
    }
}
