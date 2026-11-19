package com.horsecoder.common.whuTalent.core.flow.agent;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.junit.Assert;
import org.junit.Test;

public class AgentWorkflowServiceTest {
    private static AgentWorkflow.AgentConfig agent(String id, String model) {
        AgentWorkflow.AgentConfig config = new AgentWorkflow.AgentConfig();
        config.id = id;
        config.role = "Role of " + id;
        config.model = model;
        config.apiUrl = "https://models.example.com/v1/chat/completions";
        config.apiKey = "test-only-secret";
        return config;
    }

    private static AgentWorkflow.Request request(int revisions, String... workers) {
        AgentWorkflow.Request request = new AgentWorkflow.Request();
        request.objective = "demo";
        request.maxRevisions = revisions;
        request.supervisor = agent("lead", "supervisor-model");
        request.workers = new ArrayList<>();
        for (String worker : workers) {
            request.workers.add(agent(worker, worker + "-model"));
        }
        return request;
    }

    private static class ScriptedModel implements AgentModel {
        final List<String> calls = new ArrayList<>();
        int reviews;
        boolean alwaysReject;
        boolean unknownRetry;

        @Override
        public void validate(AgentWorkflow.AgentConfig config) {
            if (config.model == null || config.apiKey == null || config.apiUrl == null) {
                throw new IllegalArgumentException("Missing connection settings");
            }
        }

        @Override
        public AgentWorkflow.Plan plan(AgentWorkflow.AgentConfig supervisor, String objective,
                                       List<AgentWorkflow.AgentConfig> workers) {
            Assert.assertEquals("supervisor-model", supervisor.model);
            AgentWorkflow.Plan plan = new AgentWorkflow.Plan();
            plan.tasks = new ArrayList<>();
            for (AgentWorkflow.AgentConfig worker : workers) {
                AgentWorkflow.Task task = new AgentWorkflow.Task();
                task.id = worker.id + "-task";
                task.workerId = worker.id;
                task.instruction = "Work on " + objective;
                plan.tasks.add(task);
            }
            return plan;
        }

        @Override
        public String work(AgentWorkflow.AgentConfig worker, String objective, AgentWorkflow.Task task,
                           String feedback, String previousOutput) {
            Assert.assertEquals(worker.id + "-model", worker.model);
            calls.add(worker.id);
            if (previousOutput != null) {
                Assert.assertEquals("improve", feedback);
                Assert.assertEquals(worker.id + "-v1", previousOutput);
            }
            return worker.id + "-v" + (previousOutput == null ? "1" : "2");
        }

        @Override
        public AgentWorkflow.Review review(AgentWorkflow.AgentConfig supervisor, String objective,
                                           List<AgentWorkflow.TaskResult> results) {
            Assert.assertEquals("supervisor-model", supervisor.model);
            reviews++;
            AgentWorkflow.Review review = new AgentWorkflow.Review();
            review.approved = !alwaysReject && reviews == 2;
            review.feedback = "improve";
            review.retryTaskIds = Arrays.asList(unknownRetry ? "unknown" : results.get(results.size() - 1).id);
            review.finalAnswer = review.approved ? "accepted" : "unapproved";
            return review;
        }
    }

    @Test
    public void userSelectsWorkerModelsAndOnlyOneIsRetried() {
        ScriptedModel model = new ScriptedModel();
        AgentWorkflow.Response result = new AgentWorkflowService(model).run(request(1, "writer", "checker", "editor"));
        Assert.assertTrue(result.approved);
        Assert.assertEquals("accepted", result.answer);
        Assert.assertEquals(1, result.revisions);
        Assert.assertEquals(Arrays.asList("writer", "checker", "editor", "editor"), model.calls);
        Assert.assertEquals(3, result.results.size());
        Assert.assertEquals(1, result.results.get(0).attempt);
        Assert.assertEquals(2, result.results.get(2).attempt);
    }

    @Test
    public void supportsOneWorkerAndStopsAtRevisionLimit() {
        ScriptedModel model = new ScriptedModel();
        model.alwaysReject = true;
        AgentWorkflow.Response result = new AgentWorkflowService(model).run(request(1, "writer"));
        Assert.assertFalse(result.approved);
        Assert.assertNull(result.answer);
        Assert.assertEquals(1, result.revisions);
        Assert.assertEquals(2, model.reviews);
        Assert.assertEquals(Arrays.asList("writer", "writer"), model.calls);
    }

    @Test
    public void acceptsTwelveWorkers() {
        ScriptedModel model = new ScriptedModel();
        AgentWorkflow.Response result = new AgentWorkflowService(model).run(
                request(1, "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l"));
        Assert.assertEquals(12, result.results.size());
        Assert.assertEquals(13, model.calls.size());
    }

    @Test(expected = IllegalArgumentException.class)
    public void rejectsExcessiveWorkerCount() {
        new AgentWorkflowService(new ScriptedModel()).run(
                request(1, "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m"));
    }

    @Test(expected = IllegalArgumentException.class)
    public void rejectsDuplicateAgentIds() {
        new AgentWorkflowService(new ScriptedModel()).run(request(1, "writer", "writer"));
    }

    @Test(expected = IllegalArgumentException.class)
    public void rejectsExcessiveRevisionBudget() {
        new AgentWorkflowService(new ScriptedModel()).run(request(100, "writer"));
    }

    @Test(expected = IllegalStateException.class)
    public void rejectsUnknownRetryTask() {
        ScriptedModel model = new ScriptedModel();
        model.unknownRetry = true;
        new AgentWorkflowService(model).run(request(1, "writer"));
    }

    @Test(expected = IllegalArgumentException.class)
    public void rejectsUnassignedWorkerPlan() {
        ScriptedModel model = new ScriptedModel() {
            @Override
            public AgentWorkflow.Plan plan(AgentWorkflow.AgentConfig supervisor, String objective,
                                           List<AgentWorkflow.AgentConfig> workers) {
                AgentWorkflow.Plan plan = super.plan(supervisor, objective, workers);
                plan.tasks.get(1).workerId = plan.tasks.get(0).workerId;
                return plan;
            }
        };
        new AgentWorkflowService(model).run(request(1, "writer", "checker"));
    }
}
