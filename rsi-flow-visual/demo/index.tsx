import 'antd/dist/antd.css';
import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { Alert, Button, Input, InputNumber, Spin, Tag } from 'antd';
import { DeleteOutlined, PlusOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { ViewState } from '../src/VisualDiagram/logic/view/ViewState';
import VisualDiagram from '../src';
import { canvasConfig } from './test/TEST_SIMPLE_VIEW/ViewStateTemplate';
import './workspace.css';

type Agent = { id: string; role: string; apiUrl: string; apiKey: string; model: string };
type TaskResult = { id: string; workerId: string; instruction: string; output: string; attempt: number };
type RunResult = { approved: boolean; answer: string | null; feedback: string | null; revisions: number; results: TaskResult[] };

const newAgent = (id: string, role: string): Agent => ({ id, role, apiUrl: '', apiKey: '', model: '' });
const backendPath = '/api/agent/workflow';

const App = () => {
  const visualDiagramRef = useRef<any>(null);
  const runCounter = useRef(0);
  const [backend, setBackend] = useState('http://localhost:39910');
  const [objective, setObjective] = useState('');
  const [maxRevisions, setMaxRevisions] = useState(1);
  const [supervisor, setSupervisor] = useState<Agent>(newAgent('supervisor', '审核并汇总工作结果'));
  const [workers, setWorkers] = useState<Agent[]>([newAgent('worker-1', '分析任务')]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState('');

  const updateWorker = (index: number, patch: Partial<Agent>) => {
    setWorkers((current) => current.map((worker, i) => (i === index ? { ...worker, ...patch } : worker)));
  };

  const addWorker = () => {
    if (workers.length >= 6) return;
    runCounter.current += 1;
    setWorkers((current) => [...current, newAgent(`worker-${Date.now()}-${runCounter.current}`, '')]);
  };

  useEffect(() => {
    const elements = [
      { id: 'supervisor', name: supervisor.model || 'Supervisor', type: 'model' as const, color: '#1d7566', x: 360, y: 70, select: false, locked: true },
      ...workers.map((worker, index) => ({
        id: `worker-${index}`, name: worker.model || worker.id || `Worker ${index + 1}`, type: 'model' as const,
        color: '#4185a2', x: 80 + (index % 3) * 300, y: 300 + Math.floor(index / 3) * 210, select: false, locked: true,
      })),
    ];
    const links = workers.map((_, index) => ({
      id: `assign-${index}`, name: '分派 / 审核', color: '#47948c', type: 'relation', points: [],
      fromElementId: 'supervisor', toElementId: `worker-${index}`,
    }));
    const view: ViewState = { id: 'agent-workflow', elements, links };
    if (visualDiagramRef.current) visualDiagramRef.current.setView(view);
  }, [supervisor.model, workers]);

  const submit = async () => {
    setError('');
    setResult(null);
    const agents = [supervisor, ...workers];
    if (!objective.trim() || agents.some((agent) => !agent.id.trim() || !agent.role.trim() || !agent.model.trim() || !agent.apiUrl.trim() || !agent.apiKey.trim())) {
      setError('请填写目标及每个 Agent 的标识、职责、模型、API 地址和密钥。');
      return;
    }
    if (new Set(agents.map((agent) => agent.id.trim())).size !== agents.length) {
      setError('Agent 标识不能重复。');
      return;
    }
    let url: URL;
    try {
      url = new URL(backendPath, `${backend.replace(/\/$/, '')}/`);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('invalid protocol');
    } catch (_error) {
      setError('后端地址不是有效的 HTTP(S) 地址。');
      return;
    }
    setRunning(true);
    try {
      const response = await fetch(url.toString(), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objective, maxRevisions, supervisor, workers }),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(`HTTP ${response.status}: ${message.slice(0, 500) || response.statusText}`);
      }
      const payload = await response.json() as RunResult;
      setResult(payload);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '请求失败，请检查后端连接。');
    } finally {
      setRunning(false);
    }
  };

  const fields = (agent: Agent, update: (patch: Partial<Agent>) => void, prefix: string) => (
    <div className="agent-fields">
      <label htmlFor={`${prefix}-id`}>标识<input id={`${prefix}-id`} value={agent.id} onChange={(event) => update({ id: event.target.value })} autoComplete="off" /></label>
      <label htmlFor={`${prefix}-role`}>职责<input id={`${prefix}-role`} value={agent.role} onChange={(event) => update({ role: event.target.value })} autoComplete="off" /></label>
      <label htmlFor={`${prefix}-model`}>模型<input id={`${prefix}-model`} value={agent.model} onChange={(event) => update({ model: event.target.value })} placeholder="模型标识" autoComplete="off" /></label>
      <label htmlFor={`${prefix}-url`}>API 地址<input id={`${prefix}-url`} value={agent.apiUrl} onChange={(event) => update({ apiUrl: event.target.value })} placeholder="https://.../v1/chat/completions" autoComplete="url" /></label>
      <label htmlFor={`${prefix}-key`}>API 密钥<input id={`${prefix}-key`} type="password" value={agent.apiKey} onChange={(event) => update({ apiKey: event.target.value })} autoComplete="off" /></label>
    </div>
  );

  return (
    <main className="workspace">
      <header className="workspace-header"><div><h1>Agent 协作工作台</h1><span>流程编排 / 自反馈审核</span></div><Tag color="cyan">本地试运行</Tag></header>
      <div className="workspace-body">
        <section className="configuration" aria-label="Agent 配置">
          <h2>任务设置</h2>
          <label className="wide-field" htmlFor="backend">后端地址<input id="backend" value={backend} onChange={(event) => setBackend(event.target.value)} autoComplete="url" /></label>
          <label className="wide-field" htmlFor="objective">目标<Input.TextArea id="objective" rows={3} value={objective} onChange={(event) => setObjective(event.target.value)} placeholder="输入本次协作任务" maxLength={4000} /></label>
          <label className="budget" htmlFor="revisions">最多返工次数 <InputNumber id="revisions" min={0} max={2} value={maxRevisions} onChange={(value) => setMaxRevisions(typeof value === 'number' ? value : 0)} /></label>
          <div className="section-title"><h2>Supervisor</h2><Tag color="green">审核</Tag></div>
          {fields(supervisor, (patch) => setSupervisor((current) => ({ ...current, ...patch })), 'supervisor')}
          <div className="section-title"><h2>工作 Agent <small>{workers.length} / 6</small></h2><Button icon={<PlusOutlined />} onClick={addWorker} disabled={workers.length >= 6} title="添加工作 Agent" aria-label="添加工作 Agent" /></div>
          {workers.map((worker, index) => <div className="worker" key={index}>
            <div className="worker-heading"><strong>Agent {index + 1}</strong><Button type="text" danger icon={<DeleteOutlined />} disabled={workers.length === 1} onClick={() => setWorkers((current) => current.filter((_, i) => i !== index))} title="移除工作 Agent" aria-label={`移除 Agent ${index + 1}`} /></div>
            {fields(worker, (patch) => updateWorker(index, patch), `worker-${index}`)}
          </div>)}
          <div className="submit-area"><Button type="primary" icon={<PlayCircleOutlined />} loading={running} onClick={submit} block>运行流程</Button></div>
        </section>
        <section className="execution" aria-label="流程与结果">
          <div className="canvas-heading"><h2>协作拓扑</h2><span>Supervisor → 工作 Agent → 审核 / 返工</span></div>
          <div className="canvas-area"><VisualDiagram canvasConfig={canvasConfig} ref={visualDiagramRef} /></div>
          <div className="results"><h2>运行结果</h2>
            {error && <Alert type="error" showIcon message="请求未完成" description={error} />}
            {running && <div className="loading"><Spin /> 正在等待后端执行</div>}
            {!running && !error && !result && <p className="empty">尚无运行结果</p>}
            {result && <><div className="review"><Tag color={result.approved ? 'green' : 'orange'}>{result.approved ? '审核通过' : '未通过'}</Tag><span>返工 {result.revisions} 次</span></div>
              {result.feedback && <p className="feedback">审核意见：{result.feedback}</p>}
              {result.answer && <div className="answer"><h3>最终答复</h3><p>{result.answer}</p></div>}
              {(result.results || []).map((item) => <article className="task-result" key={item.id}><div><strong>{item.workerId}</strong><span>第 {item.attempt} 次执行</span></div><p className="instruction">{item.instruction}</p><p>{item.output}</p></article>)}
            </>}
          </div>
        </section>
      </div>
    </main>
  );
};

ReactDOM.render(<App />, document.getElementById('root'));
