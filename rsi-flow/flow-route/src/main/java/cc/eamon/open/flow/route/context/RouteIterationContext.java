package cc.eamon.open.flow.route.context;

import cc.eamon.open.flow.route.stereotype.Route;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.IdentityHashMap;
import java.util.Map;

/** Counts bounded route traversals separately for each invocation, including nested flows. */
public final class RouteIterationContext {

    private static final ThreadLocal<Deque<Map<Route, Integer>>> COUNTS =
            ThreadLocal.withInitial(ArrayDeque::new);

    private RouteIterationContext() {
    }

    public static void begin() {
        COUNTS.get().push(new IdentityHashMap<>());
    }

    public static void end() {
        Deque<Map<Route, Integer>> stack = COUNTS.get();
        stack.pop();
        if (stack.isEmpty()) {
            COUNTS.remove();
        }
    }

    public static boolean available(Route route) {
        Integer limit = route.getMaxIterations();
        if (limit == null) {
            return true;
        }
        Map<Route, Integer> counts = COUNTS.get().peek();
        if (counts == null) {
            throw new IllegalStateException("Bounded route used outside a flow invocation");
        }
        return counts.getOrDefault(route, 0) < limit;
    }

    public static void traversed(Route route) {
        if (route.getMaxIterations() == null) {
            return;
        }
        Map<Route, Integer> counts = COUNTS.get().peek();
        if (counts == null) {
            throw new IllegalStateException("Bounded route used outside a flow invocation");
        }
        counts.put(route, counts.getOrDefault(route, 0) + 1);
    }
}
