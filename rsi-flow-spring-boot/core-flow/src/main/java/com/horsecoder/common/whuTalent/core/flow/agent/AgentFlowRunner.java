package com.horsecoder.common.whuTalent.core.flow.agent;

import cc.eamon.open.flow.config.constants.FlowConstants;
import cc.eamon.open.flow.config.flow.FlowConfig;
import cc.eamon.open.flow.core.FlowEngine;
import cc.eamon.open.flow.core.context.Initializer;
import cc.eamon.open.flow.core.context.InitializerEnums;
import cc.eamon.open.flow.core.stereotype.definition.FlowCode;
import cc.eamon.open.flow.core.stereotype.execute.holder.FlowHolder;
import cc.eamon.open.flow.model.enums.TypeEnums;
import com.alibaba.fastjson.JSON;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class AgentFlowRunner {
    public static final String FLOW_ID = "FLOW_AGENT_WORKFLOW";
    private static final String ROUND_ID = "AGENT_WORKFLOW_ROUND";
    private final AgentWorkflowService workflow;

    public AgentFlowRunner(AgentWorkflowService workflow) {
        this.workflow = workflow;
    }

    public AgentWorkflow.Response run(AgentWorkflow.Request request) throws Exception {
        AgentWorkflowService.RunState state = workflow.start(request);
        FlowEngine engine = FlowEngine.instance();
        try {
            ensureRegistered();
            engine.register(FlowConstants.SCOPE_DEFAULT, "agentState", state);
            engine.run(FLOW_ID);
            AgentWorkflow.Response result = (AgentWorkflow.Response) engine.retrieve(FLOW_ID, "agentResponse");
            if (result == null || !state.isDone()) {
                throw new IllegalStateException("Agent flow exited before the run completed");
            }
            return result;
        } finally {
            engine.release();
        }
    }

    private static void ensureRegistered() throws Exception {
        Initializer initializer = InitializerEnums.DEFAULT.getInitializer();
        synchronized (initializer) {
            if (initializer.getFlowHolder(FLOW_ID) != null) return;
            FlowConfig config;
            try (InputStream stream = AgentFlowRunner.class.getClassLoader()
                    .getResourceAsStream("agent-flow/flow-agent-workflow.json")) {
                if (stream == null) throw new IllegalStateException("Agent flow resource is missing");
                ByteArrayOutputStream buffer = new ByteArrayOutputStream();
                byte[] chunk = new byte[4096];
                int count;
                while ((count = stream.read(chunk)) != -1) buffer.write(chunk, 0, count);
                config = JSON.parseObject(new String(buffer.toByteArray(), StandardCharsets.UTF_8), FlowConfig.class);
            }
            if (config == null || !FLOW_ID.equals(config.getId())) {
                throw new IllegalStateException("Agent flow resource has an invalid ID");
            }
            initializer.addExtraFlowCode(Collections.singletonMap(ROUND_ID, new FlowCode() {
                private final AgentWorkflowFlowNode node = new AgentWorkflowFlowNode();
                @Override public String getName() { return ROUND_ID; }
                @Override public String getRetrieve() { return ""; }
                @Override public String getScope() { return FlowConstants.SCOPE_DEFAULT; }
                @Override public List<TypeEnums> getParamTypes() { return Collections.emptyList(); }
                @Override public Object execute(Object... args) {
                    node.runRound();
                    return null;
                }
            }));
            FlowHolder holder = new FlowHolder(config);
            initializer.addExtraFlowConfig(Collections.singletonMap(FLOW_ID, config));
            initializer.addExtraFlowHolder(Collections.singletonMap(FLOW_ID, holder));
        }
    }
}
