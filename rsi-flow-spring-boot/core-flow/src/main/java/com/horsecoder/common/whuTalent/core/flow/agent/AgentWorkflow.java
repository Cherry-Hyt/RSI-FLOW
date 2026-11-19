package com.horsecoder.common.whuTalent.core.flow.agent;

import java.util.ArrayList;
import java.util.List;

/** Request, model decisions and observable outcome for one bounded run. */
public final class AgentWorkflow {
    private AgentWorkflow() { }

    public static class Request {
        public String objective;
        public int maxRevisions = 1;
        public AgentConfig supervisor;
        public List<AgentConfig> workers;
    }

    public static class AgentConfig {
        public String id;
        public String role;
        public String apiUrl;
        public String apiKey;
        public String model;
    }

    public static class Task {
        public String id;
        public String workerId;
        public String instruction;
    }

    public static class Plan {
        public List<Task> tasks;
    }

    public static class Review {
        public boolean approved;
        public String feedback;
        public List<String> retryTaskIds;
        public String finalAnswer;
    }

    public static class TaskResult {
        public String id;
        public String workerId;
        public String instruction;
        public String output;
        public int attempt;

        public TaskResult() { }

        public TaskResult(Task task, String output, int attempt) {
            this.id = task.id;
            this.workerId = task.workerId;
            this.instruction = task.instruction;
            this.output = output;
            this.attempt = attempt;
        }
    }

    public static class Response {
        public boolean approved;
        public String answer;
        public String feedback;
        public int revisions;
        public List<TaskResult> results = new ArrayList<>();
    }
}
