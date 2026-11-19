package cc.eamon.open.flow.core.context;

import cc.eamon.open.flow.config.flow.FlowConfig;
import cc.eamon.open.flow.config.flow.FlowRouteConfig;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Ensures every cycle traverses at least one bounded route. */
public final class FlowRouteValidator {

    private FlowRouteValidator() {
    }

    public static void validate(FlowConfig flow) {
        Map<String, List<String>> unbounded = new HashMap<>();
        for (FlowRouteConfig route : flow.getRoutes()) {
            if (route.getMaxIterations() != null) {
                if (route.getMaxIterations() < 1) {
                    throw new IllegalArgumentException("maxIterations must be positive");
                }
                continue;
            }
            unbounded.computeIfAbsent(route.getSource(), key -> new ArrayList<>()).add(route.getTarget());
        }
        Set<String> visited = new HashSet<>();
        Set<String> active = new HashSet<>();
        for (String source : unbounded.keySet()) {
            visit(source, unbounded, visited, active, flow.getId());
        }
    }

    private static void visit(String node, Map<String, List<String>> edges, Set<String> visited,
                              Set<String> active, String flowId) {
        if (active.contains(node)) {
            throw new IllegalArgumentException("Flow " + flowId + " has a cycle without maxIterations at " + node);
        }
        if (!visited.add(node)) {
            return;
        }
        active.add(node);
        for (String target : edges.getOrDefault(node, new ArrayList<>())) {
            visit(target, edges, visited, active, flowId);
        }
        active.remove(node);
    }
}
