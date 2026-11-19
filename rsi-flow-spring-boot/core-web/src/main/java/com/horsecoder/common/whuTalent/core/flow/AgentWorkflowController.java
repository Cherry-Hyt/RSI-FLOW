package com.horsecoder.common.whuTalent.core.flow;

import com.horsecoder.common.whuTalent.core.flow.agent.AgentWorkflow;
import com.horsecoder.common.whuTalent.core.flow.agent.AgentFlowRunner;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@CrossOrigin(origins = {"http://localhost:1234", "http://127.0.0.1:1234"})
@RequestMapping("api/agent/workflow")
public class AgentWorkflowController {
    private final AgentFlowRunner runner;

    public AgentWorkflowController(AgentFlowRunner runner) {
        this.runner = runner;
    }

    @PostMapping
    public AgentWorkflow.Response run(@RequestBody AgentWorkflow.Request request) throws Exception {
        return runner.run(request);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public String invalidRequest(IllegalArgumentException error) {
        return error.getMessage();
    }
}
