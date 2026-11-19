package com.horsecoder.common.whuTalent.core.flow.agent;

import java.util.List;

/** Replaceable model boundary; production uses chat completions, tests use scripted decisions. */
public interface AgentModel {
    void validate(AgentWorkflow.AgentConfig config);
    AgentWorkflow.Plan plan(AgentWorkflow.AgentConfig supervisor, String objective,
                            List<AgentWorkflow.AgentConfig> workers);
    String work(AgentWorkflow.AgentConfig worker, String objective, AgentWorkflow.Task task,
                String feedback, String previousOutput);
    AgentWorkflow.Review review(AgentWorkflow.AgentConfig supervisor, String objective,
                                List<AgentWorkflow.TaskResult> results);
}
