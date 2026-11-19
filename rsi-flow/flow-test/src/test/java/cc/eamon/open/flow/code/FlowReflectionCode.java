package cc.eamon.open.flow.code;

import cc.eamon.open.flow.core.FlowEngine;
import cc.eamon.open.flow.core.stereotype.Flow;

public class FlowReflectionCode {

    @Flow(value = "FLOW_REFLECTION_REVISE")
    public void revise(String draft) {
        FlowEngine.instance().register("draft", draft + "!");
    }
}
