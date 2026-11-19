package cc.eamon.open.flow.FLOW_REFLECTION_LOOP;

import cc.eamon.open.flow.config.flow.FlowConfig;
import cc.eamon.open.flow.config.flow.FlowRouteConfig;
import cc.eamon.open.flow.core.context.FlowRouteValidator;
import org.testng.annotations.Test;

import java.util.Arrays;

public class FlowRouteValidatorTest {

    private FlowRouteConfig route(String source, String target, Integer limit) {
        FlowRouteConfig route = new FlowRouteConfig();
        route.setSource(source);
        route.setTarget(target);
        route.setMaxIterations(limit);
        return route;
    }

    @Test(expectedExceptions = IllegalArgumentException.class)
    public void rejectsUnboundedCycles() {
        FlowConfig flow = new FlowConfig();
        flow.setId("unbounded");
        flow.setRoutes(Arrays.asList(route("start", "a", null), route("a", "b", null),
                route("b", "a", null), route("b", "end", null)));
        FlowRouteValidator.validate(flow);
    }

    @Test
    public void acceptsCyclesWithABoundedBackEdge() {
        FlowConfig flow = new FlowConfig();
        flow.setId("bounded");
        flow.setRoutes(Arrays.asList(route("start", "a", null), route("a", "b", null),
                route("b", "a", 2), route("b", "end", null)));
        FlowRouteValidator.validate(flow);
    }

    @Test(expectedExceptions = IllegalArgumentException.class)
    public void rejectsZeroIterationLimit() {
        route("a", "a", 0);
    }
}
