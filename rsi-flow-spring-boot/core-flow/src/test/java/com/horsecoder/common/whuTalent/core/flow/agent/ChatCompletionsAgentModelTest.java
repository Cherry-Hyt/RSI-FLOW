package com.horsecoder.common.whuTalent.core.flow.agent;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.Assert;
import org.junit.Test;

public class ChatCompletionsAgentModelTest {
    private final ChatCompletionsAgentModel model = new ChatCompletionsAgentModel(
            "models.example.com,other.example.com", new ObjectMapper());

    private AgentWorkflow.AgentConfig config(String url) {
        AgentWorkflow.AgentConfig agent = new AgentWorkflow.AgentConfig();
        agent.id = "worker";
        agent.role = "research";
        agent.apiUrl = url;
        agent.apiKey = "not-a-real-key";
        agent.model = "selected-model";
        return agent;
    }

    @Test
    public void acceptsConfiguredHttpsEndpoint() {
        model.validate(config("https://models.example.com/v1/chat/completions"));
    }

    @Test
    public void rejectsUnlistedHostAndSimilarSuffix() {
        assertInvalid("https://private.example.com/v1/chat/completions");
        assertInvalid("https://models.example.com.attacker.org/v1/chat/completions");
    }

    @Test
    public void rejectsInsecureAndNonstandardEndpoints() {
        assertInvalid("http://models.example.com/v1/chat/completions");
        assertInvalid("https://models.example.com:8443/v1/chat/completions");
        assertInvalid("https://models.example.com/admin");
        assertInvalid("https://models.example.com/v1/chat/completions?redirect=1");
        assertInvalid("https://user@models.example.com/v1/chat/completions");
    }

    private void assertInvalid(String url) {
        try {
            model.validate(config(url));
            Assert.fail("Expected rejection: " + url);
        } catch (IllegalArgumentException expected) {
            // Validation must reject before a network request is attempted.
        }
    }
}
