package cc.eamon.open.flow.FLOW_REFLECTION_LOOP;

import cc.eamon.open.flow.route.context.RouteIterationContext;
import cc.eamon.open.flow.route.stereotype.Condition;
import cc.eamon.open.flow.route.stereotype.Route;
import cc.eamon.open.flow.route.stereotype.Source;
import cc.eamon.open.flow.route.stereotype.Target;
import org.testng.Assert;
import org.testng.annotations.Test;

public class RouteIterationContextTest {

    @Test
    public void nestedInvocationDoesNotConsumeOuterIterations() {
        Route route = new Route() {
            @Override
            public Source getSource() { return () -> "a"; }
            @Override
            public Target getTarget() { return () -> "a"; }
            @Override
            public Condition getCondition() { return null; }
            @Override
            public Integer getMaxIterations() { return 2; }
        };

        RouteIterationContext.begin();
        try {
            RouteIterationContext.traversed(route);
            RouteIterationContext.begin();
            try {
                Assert.assertTrue(RouteIterationContext.available(route));
                RouteIterationContext.traversed(route);
                RouteIterationContext.traversed(route);
                Assert.assertFalse(RouteIterationContext.available(route));
            } finally {
                RouteIterationContext.end();
            }
            Assert.assertTrue(RouteIterationContext.available(route));
            RouteIterationContext.traversed(route);
            Assert.assertFalse(RouteIterationContext.available(route));
        } finally {
            RouteIterationContext.end();
        }
    }
}
