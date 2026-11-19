package cc.eamon.open.flow.config.flow;

import com.alibaba.fastjson.annotation.JSONField;

import java.io.Serializable;

/**
 * Author: lucas
 * Date: 2020/7/5
 * Email: lucas@eamon.cc
 */
public class FlowRouteConfig implements Serializable {

    /**
     * serialVersionUID
     */
    private static final long serialVersionUID = 6604021116438509087L;

    /**
     * 源节点
     */
    @JSONField(ordinal = 1)
    private String source;

    /**
     * 目标节点
     */
    @JSONField(ordinal = 2)
    private String target;

    /**
     * 到目标节点的条件
     */
    @JSONField(ordinal = 3)
    private String condition = "true";

    /**
     * 目标条件所处域
     */
    @JSONField(ordinal = 4)
    private String scope;

    /** Maximum number of times this route may be traversed per flow run. */
    @JSONField(ordinal = 5)
    private Integer maxIterations;

    public Integer getMaxIterations() {
        return maxIterations;
    }

    public void setMaxIterations(Integer maxIterations) {
        if (maxIterations != null && maxIterations < 1) {
            throw new IllegalArgumentException("maxIterations must be positive");
        }
        this.maxIterations = maxIterations;
    }

    public String getSource() {
        return source;
    }

    public void setSource(String source) {
        this.source = source;
    }

    public String getTarget() {
        return target;
    }

    public void setTarget(String target) {
        this.target = target;
    }

    public String getCondition() {
        return condition;
    }

    public void setCondition(String condition) {
        this.condition = condition;
    }

    public String getScope() {
        return scope;
    }

    public void setScope(String scope) {
        this.scope = scope;
    }
}
