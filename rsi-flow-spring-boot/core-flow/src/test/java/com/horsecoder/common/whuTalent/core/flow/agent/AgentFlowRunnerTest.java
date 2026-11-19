package com.horsecoder.common.whuTalent.core.flow.agent;

import cc.eamon.open.flow.core.FlowEngine;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import org.junit.Assert;
import org.junit.Test;

public class AgentFlowRunnerTest {
    private static class ScriptedModel implements AgentModel {
        int reviews;
        int workCalls;
        boolean rejectAll;

        @Override
        public void validate(AgentWorkflow.AgentConfig config) { }

        @Override
        public AgentWorkflow.Plan plan(AgentWorkflow.AgentConfig supervisor, String objective,
                                       List<AgentWorkflow.AgentConfig> workers) {
            AgentWorkflow.Plan plan = new AgentWorkflow.Plan();
            plan.tasks = new ArrayList<>();
            for (AgentWorkflow.AgentConfig worker : workers) {
                AgentWorkflow.Task task = new AgentWorkflow.Task();
                task.id = worker.id + "-task";
                task.workerId = worker.id;
                task.instruction = objective;
                plan.tasks.add(task);
            }
            return plan;
        }

        @Override
        public String work(AgentWorkflow.AgentConfig worker, String objective, AgentWorkflow.Task task,
                           String feedback, String previousOutput) {
            workCalls++;
            return task.id + (previousOutput == null ? "-first" : "-revised");
        }

        @Override
        public AgentWorkflow.Review review(AgentWorkflow.AgentConfig supervisor, String objective,
                                           List<AgentWorkflow.TaskResult> results) {
            reviews++;
            AgentWorkflow.Review review = new AgentWorkflow.Review();
            review.approved = !rejectAll && reviews == 2;
            review.feedback = "revise";
            review.retryTaskIds = Collections.singletonList(results.get(0).id);
            review.finalAnswer = review.approved ? "accepted" : null;
            return review;
        }
    }

    private static AgentWorkflow.Request request(int maxRevisions) {
        AgentWorkflow.AgentConfig supervisor = new AgentWorkflow.AgentConfig();
        supervisor.id = "lead";
        supervisor.role = "supervisor";
        AgentWorkflow.AgentConfig worker = new AgentWorkflow.AgentConfig();
        worker.id = "writer";
        worker.role = "writer";
        AgentWorkflow.Request request = new AgentWorkflow.Request();
        request.objective = "draft";
        request.supervisor = supervisor;
        request.workers = Arrays.asList(worker);
        request.maxRevisions = maxRevisions;
        return request;
    }

    @Test
    public void reviewRevisesThroughEngineBackEdge() throws Exception {
        ScriptedModel model = new ScriptedModel();
        AgentWorkflowService service = new AgentWorkflowService(model);
        AgentWorkflow.Response response = new AgentFlowRunner(service).run(request(2));
        Assert.assertTrue(response.approved);
        Assert.assertEquals("accepted", response.answer);
        Assert.assertEquals(2, model.reviews);
        Assert.assertEquals(2, model.workCalls);
        Assert.assertEquals("writer-task-revised", response.results.get(0).output);
    }

    @Test
    public void onlySelectedWorkerRevisesAndZeroBudgetEndsImmediately() throws Exception {
        ScriptedModel model = new ScriptedModel();
        AgentWorkflow.Request multi = request(2);
        AgentWorkflow.AgentConfig checker = new AgentWorkflow.AgentConfig();
        checker.id = "checker";
        checker.role = "reviewer";
        multi.workers = Arrays.asList(multi.workers.get(0), checker);
        AgentWorkflow.Response response = new AgentFlowRunner(new AgentWorkflowService(model)).run(multi);
        Assert.assertTrue(response.approved);
        Assert.assertEquals(3, model.workCalls);
        Assert.assertEquals(2, response.results.size());
        Assert.assertEquals(2, response.results.get(0).attempt);
        Assert.assertEquals(1, response.results.get(1).attempt);

        ScriptedModel rejected = new ScriptedModel();
        rejected.rejectAll = true;
        AgentWorkflow.Response stopped = new AgentFlowRunner(new AgentWorkflowService(rejected)).run(request(0));
        Assert.assertFalse(stopped.approved);
        Assert.assertEquals(1, rejected.reviews);
        Assert.assertEquals(0, stopped.revisions);
    }

    @Test
    public void exceptionReleasesEngineContextForFollowingRequest() throws Exception {
        ScriptedModel broken = new ScriptedModel() {
            @Override
            public String work(AgentWorkflow.AgentConfig worker, String objective, AgentWorkflow.Task task,
                               String feedback, String previousOutput) {
                throw new IllegalStateException("worker failed");
            }
        };
        try {
            new AgentFlowRunner(new AgentWorkflowService(broken)).run(request(1));
            Assert.fail("Expected worker failure");
        } catch (IllegalStateException expected) {
            Assert.assertEquals("worker failed", expected.getMessage());
        }
        ScriptedModel healthy = new ScriptedModel();
        AgentWorkflow.Response response = new AgentFlowRunner(new AgentWorkflowService(healthy)).run(request(1));
        Assert.assertTrue(response.approved);
        Assert.assertEquals(2, healthy.reviews);
        FlowEngine.instance().release();
    }

    @Test
    public void rejectedRunStopsAtBudgetAndResetsForNextRequest() throws Exception {
        for (int i = 0; i < 2; i++) {
            ScriptedModel model = new ScriptedModel();
            model.rejectAll = true;
            AgentWorkflowService service = new AgentWorkflowService(model);
            AgentWorkflow.Response response = new AgentFlowRunner(service).run(request(2));
            Assert.assertFalse(response.approved);
            Assert.assertNull(response.answer);
            Assert.assertEquals(3, model.reviews);
            Assert.assertEquals(2, response.revisions);
        }
    }
}
