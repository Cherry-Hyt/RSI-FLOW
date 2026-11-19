package cc.eamon.open.flow.FLOW_REFLECTION_LOOP;

import cc.eamon.open.flow.config.constants.FlowConstants;
import cc.eamon.open.flow.core.FlowEngine;
import org.testng.Assert;
import org.testng.annotations.Test;

public class FlowReflectionLoopTest {

    private String run(String goal) throws Exception {
        FlowEngine engine = FlowEngine.instance();
        try {
            return (String) engine.register(FlowConstants.SCOPE_DEFAULT, "draft", "start")
                    .register(FlowConstants.SCOPE_DEFAULT, "goal", goal)
                    .run("FLOW_REFLECTION_LOOP")
                    .retrieve("FLOW_REFLECTION_LOOP", "draft");
        } finally {
            engine.release();
        }
    }

    @Test
    public void stopsWhenTheGoalIsReachedAndCarriesThePreviousDraft() throws Exception {
        Assert.assertEquals(run("start!!"), "start!!");
    }

    @Test
    public void stopsAtTheIterationLimitAndResetsOnTheNextRun() throws Exception {
        Assert.assertEquals(run("unreachable"), "start!!!");
        Assert.assertEquals(run("unreachable"), "start!!!");
    }
}
