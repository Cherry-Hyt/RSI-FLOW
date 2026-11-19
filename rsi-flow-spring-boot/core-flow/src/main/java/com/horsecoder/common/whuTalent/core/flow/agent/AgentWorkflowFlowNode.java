package com.horsecoder.common.whuTalent.core.flow.agent;

import cc.eamon.open.flow.core.FlowEngine;
import cc.eamon.open.flow.core.stereotype.Flow;
import cc.eamon.open.flow.spring.FlowComponent;

@FlowComponent
public class AgentWorkflowFlowNode {
    @Flow("AGENT_WORKFLOW_ROUND")
    public void runRound() {
        FlowEngine engine = FlowEngine.instance();
        AgentWorkflowService.RunState state = (AgentWorkflowService.RunState) engine.retrieve("agentState");
        if (state == null) {
            throw new IllegalStateException("Agent workflow state is missing");
        }
        state.advance();
        engine.register("agentDone", state.isDone());
        engine.register("agentResponse", state.getResponse());
    }
}
