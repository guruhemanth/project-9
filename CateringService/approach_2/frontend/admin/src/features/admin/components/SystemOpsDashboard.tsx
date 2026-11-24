import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Activity,
  Server,
  Cpu,
  HardDrive,
  RefreshCw,
  Terminal,
  Clock,
  XCircle,
  Copy,
  Check,
  Download,
  Filter,
  Layers,
  Database,
  Zap,
} from 'lucide-react';
import { fetchOpsNodesMetrics, fetchOpsContainers, fetchOpsLogs } from '../api';
import type {
  ServiceNodeMetric,
  HostServerMetrics,
  ContainerInfo,
  OpsNodesResponse,
  OpsLogsResponse,
} from '@caterconnect/shared';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatDuration(seconds: number): string {
  const days = Math.floor(seconds / (3600 * 24));
  const hrs = Math.floor((seconds % (3600 * 24)) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hrs > 0) parts.push(`${hrs}h`);
  parts.push(`${mins}m`);
  return parts.join(' ');
}

export const SystemOpsDashboard: React.FC = () => {
  const [nodes, setNodes] = useState<ServiceNodeMetric[]>([]);
  const [host, setHost] = useState<HostServerMetrics | null>(null);
  const [summary, setSummary] = useState<OpsNodesResponse['summary'] | null>(null);
  const [containers, setContainers] = useState<ContainerInfo[]>([]);

  // Refresh controls
  const [refreshInterval, setRefreshInterval] = useState<number>(10000); // 10s default
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Logs viewer state
  const [selectedContainer, setSelectedContainer] = useState<string>('caterconnect-api-gateway');
  const [logTail, setLogTail] = useState<number>(100);
  const [logFilter, setLogFilter] = useState<string>('');
  const [logs, setLogs] = useState<string[]>([]);
  const [logSource, setLogSource] = useState<'docker-engine' | 'simulated'>('docker-engine');
  const [loadingLogs, setLoadingLogs] = useState<boolean>(false);
  const [copiedLogs, setCopiedLogs] = useState<boolean>(false);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);

  const logEndRef = useRef<HTMLDivElement>(null);
  const logSectionRef = useRef<HTMLDivElement>(null);

  // Load Node metrics and container list
  const loadOpsData = useCallback(async (silent = false) => {
    try {
      if (!silent) setRefreshing(true);
      setFetchError(null);

      const [nodesRes, containersRes] = await Promise.allSettled([
        fetchOpsNodesMetrics(),
        fetchOpsContainers(),
      ]);

      if (nodesRes.status === 'fulfilled' && nodesRes.value) {
        setNodes(nodesRes.value.nodes || []);
        setHost(nodesRes.value.host || null);
        setSummary(nodesRes.value.summary || null);
        setLastRefreshed(new Date());
      } else if (nodesRes.status === 'rejected') {
        setFetchError(nodesRes.reason?.message || 'Failed to fetch node health metrics');
      }

      if (containersRes.status === 'fulfilled' && containersRes.value) {
        setContainers(containersRes.value.containers || []);
        // If current selected container is not set or not in list, default to first caterconnect container
        if (containersRes.value.containers.length > 0) {
          const exists = containersRes.value.containers.some((c) => c.name === selectedContainer);
          if (!exists) {
            setSelectedContainer(containersRes.value.containers[0].name);
          }
        }
      }
    } finally {
      setRefreshing(false);
    }
  }, [selectedContainer]);

  // Load logs for selected container
  const loadLogs = useCallback(async (containerName: string, tail: number, filter: string) => {
    setLoadingLogs(true);
    try {
      const res: OpsLogsResponse = await fetchOpsLogs(containerName, tail, filter);
      setLogs(res.lines || []);
      setLogSource(res.source || 'docker-engine');
    } catch (err: any) {
      setLogs([`[ERROR] Failed to stream logs for ${containerName}: ${err.message}`]);
    } finally {
      setLoadingLogs(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadOpsData();
  }, [loadOpsData]);

  // Auto-refresh timer for node metrics
  useEffect(() => {
    if (refreshInterval <= 0) return;
    const interval = setInterval(() => {
      loadOpsData(true);
    }, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshInterval, loadOpsData]);

  // Fetch logs when container, tail, or debounced filter changes
  useEffect(() => {
    if (selectedContainer) {
      loadLogs(selectedContainer, logTail, logFilter);
    }
  }, [selectedContainer, logTail, logFilter, loadLogs]);

  // Auto-scroll logs to bottom
  useEffect(() => {
    if (autoScroll && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const handleCopyLogs = () => {
    navigator.clipboard.writeText(logs.join('\n'));
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  const handleDownloadLogs = () => {
    const blob = new Blob([logs.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedContainer}_${Date.now()}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const inspectContainerLogs = (serviceKey: string) => {
    setSelectedContainer(serviceKey);
    logSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Ops Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-700 text-white shadow-2xs">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">System Ops & Node Health Center</h2>
              <p className="text-xs text-slate-500">
                Real-time node latency (ms), health status of 8 core backend services, host RAM/CPU load, and live container logs.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Cluster Summary Pills */}
          {summary && (
            <div className="flex items-center gap-2">
              <div
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border ${
                  summary.downCount > 0
                    ? 'bg-rose-50 text-rose-800 border-rose-200'
                    : summary.degradedCount > 0
                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                }`}
              >
                <div
                  className={`h-2 w-2 rounded-full ${
                    summary.downCount > 0
                      ? 'bg-rose-600 animate-pulse'
                      : summary.degradedCount > 0
                      ? 'bg-amber-500'
                      : 'bg-emerald-600'
                  }`}
                />
                <span>
                  {summary.healthyCount}/{summary.totalNodes} Operational
                </span>
              </div>

              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold bg-slate-100 text-slate-800 border border-slate-200">
                <Zap className="h-3.5 w-3.5 text-amber-600" />
                <span>Avg: {summary.avgLatencyMs} ms</span>
              </div>
            </div>
          )}

          {/* Auto Refresh Selector */}
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-2 py-1 text-xs">
            <Clock className="h-3.5 w-3.5 text-slate-500" />
            <select
              value={refreshInterval}
              onChange={(e) => setRefreshInterval(Number(e.target.value))}
              className="bg-transparent font-medium text-slate-700 focus:outline-none cursor-pointer"
            >
              <option value={5000}>Auto: 5s</option>
              <option value={10000}>Auto: 10s</option>
              <option value={30000}>Auto: 30s</option>
              <option value={0}>Paused</option>
            </select>
          </div>

          {/* Manual Refresh Button */}
          <button
            type="button"
            onClick={() => loadOpsData()}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded-lg bg-purple-700 hover:bg-purple-800 text-white px-3.5 py-1.5 text-xs font-semibold shadow-2xs transition disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'Probing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {fetchError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 flex items-center gap-2 text-xs text-rose-800">
          <XCircle className="h-4 w-4 shrink-0 text-rose-600" />
          <span>{fetchError}</span>
        </div>
      )}

      {/* Host Server Metrics Bar */}
      {host && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* RAM Usage */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-600">
              <span className="flex items-center gap-1.5">
                <HardDrive className="h-4 w-4 text-purple-600" /> Host Memory (RAM)
              </span>
              <span
                className={`font-mono text-xs px-1.5 py-0.5 rounded ${
                  host.usedMemPct > 85
                    ? 'bg-rose-100 text-rose-800'
                    : host.usedMemPct > 70
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {host.usedMemPct}% Used
              </span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
              <div
                className={`h-2.5 rounded-full transition-all duration-500 ${
                  host.usedMemPct > 85 ? 'bg-rose-500' : host.usedMemPct > 70 ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(host.usedMemPct, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] font-mono text-slate-500">
              <span>Used: {formatBytes(host.totalMemBytes - host.freeMemBytes)}</span>
              <span>Total: {formatBytes(host.totalMemBytes)}</span>
            </div>
          </div>

          {/* CPU Load Average */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-600">
              <span className="flex items-center gap-1.5">
                <Cpu className="h-4 w-4 text-indigo-600" /> CPU Load Average
              </span>
              <span className="text-[11px] font-mono text-slate-500">{host.cpuCount} Cores</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center pt-1">
              <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                <div className="text-[10px] text-slate-400 font-bold uppercase">1 min</div>
                <div className="text-xs font-mono font-bold text-slate-900">{host.loadAvg[0].toFixed(2)}</div>
              </div>
              <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                <div className="text-[10px] text-slate-400 font-bold uppercase">5 min</div>
                <div className="text-xs font-mono font-bold text-slate-900">{host.loadAvg[1].toFixed(2)}</div>
              </div>
              <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                <div className="text-[10px] text-slate-400 font-bold uppercase">15 min</div>
                <div className="text-xs font-mono font-bold text-slate-900">{host.loadAvg[2].toFixed(2)}</div>
              </div>
            </div>
          </div>

          {/* Host Uptime & Platform */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-600">
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-teal-600" /> System Uptime
              </span>
              <span className="font-mono text-[11px] text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full font-bold">
                Online
              </span>
            </div>
            <div className="text-xl font-black text-slate-900 pt-1 font-mono">
              {formatDuration(host.uptimeSeconds)}
            </div>
            <div className="text-[11px] text-slate-500 font-mono">
              OS: {host.platform} ({host.arch})
            </div>
          </div>

          {/* Node Runtime Engine */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-600">
              <span className="flex items-center gap-1.5">
                <Server className="h-4 w-4 text-amber-600" /> Runtime Architecture
              </span>
              <span className="font-mono text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                {host.nodeVersion}
              </span>
            </div>
            <div className="text-xs font-semibold text-slate-800 pt-1">
              Dockerized Microservices
            </div>
            <div className="text-[11px] text-slate-500 font-mono">
              Last probe: {lastRefreshed.toLocaleTimeString()}
            </div>
          </div>
        </div>
      )}

      {/* 8 Monitored Backend Nodes Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
            <Layers className="h-4 w-4 text-purple-700" />
            Core Backend Microservice Nodes ({nodes.length})
          </h3>
          <span className="text-[11px] text-slate-400">
            Latency Thresholds: &lt;150ms Fast (Green) • 150-500ms Moderate (Yellow) • &gt;500ms Slow (Red)
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {nodes.map((node) => {
            const isHealthy = node.status === 'healthy';
            const isDegraded = node.status === 'degraded';

            // Latency color code
            const latencyColor =
              node.latencyMs < 150
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : node.latencyMs <= 500
                ? 'bg-amber-50 text-amber-800 border-amber-200'
                : 'bg-rose-50 text-rose-800 border-rose-200';

            return (
              <div
                key={node.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs hover:border-purple-300 transition flex flex-col justify-between space-y-3"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {node.id === 'postgres' ? (
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                          <Database className="h-4 w-4" />
                        </div>
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100 text-purple-700">
                          <Server className="h-4 w-4" />
                        </div>
                      )}
                      <div>
                        <h4 className="font-bold text-xs text-slate-900 leading-tight">{node.name}</h4>
                        <span className="text-[10px] font-mono text-slate-400 block truncate max-w-[150px]">
                          {node.serviceKey}
                        </span>
                      </div>
                    </div>

                    {/* Status Pill */}
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        isHealthy
                          ? 'bg-emerald-100 text-emerald-800'
                          : isDegraded
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          isHealthy ? 'bg-emerald-600' : isDegraded ? 'bg-amber-600' : 'bg-rose-600 animate-pulse'
                        }`}
                      />
                      {node.status}
                    </span>
                  </div>

                  {/* Metrics Row */}
                  <div className="mt-3 grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs">
                    <div>
                      <span className="text-[10px] font-semibold text-slate-400 uppercase block">Response Time</span>
                      <div className={`inline-flex items-center gap-1 font-mono font-bold px-1.5 py-0.5 rounded border text-[11px] ${latencyColor}`}>
                        <Zap className="h-3 w-3" />
                        <span>{node.latencyMs} ms</span>
                      </div>
                    </div>
                    <div>
                      <span className="text-[10px] font-semibold text-slate-400 uppercase block">HTTP / Port</span>
                      <div className="font-mono text-[11px] text-slate-700 font-semibold mt-0.5">
                        {node.httpStatus ? `${node.httpStatus} OK` : 'TCP'} ({node.port})
                      </div>
                    </div>
                  </div>

                  {node.error && (
                    <div className="mt-2 text-[10px] font-mono text-rose-600 bg-rose-50 p-1.5 rounded border border-rose-100 break-words">
                      {node.error}
                    </div>
                  )}
                </div>

                {/* Card Footer Actions */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[10px] text-slate-400 font-mono">
                    {node.uptimeSeconds ? `Up ${formatDuration(node.uptimeSeconds)}` : 'Active'}
                  </span>
                  <button
                    type="button"
                    onClick={() => inspectContainerLogs(node.serviceKey)}
                    className="flex items-center gap-1 text-[11px] font-semibold text-purple-700 hover:text-purple-900 transition"
                  >
                    <Terminal className="h-3 w-3" />
                    <span>View Logs</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Interactive Container Log Viewer */}
      <div ref={logSectionRef} className="rounded-2xl border border-slate-800 bg-slate-950 p-5 shadow-lg space-y-4">
        {/* Terminal Header & Selectors */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-900/60 text-purple-300 border border-purple-700/50">
              <Terminal className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
                <span>Container Log Stream</span>
                {logSource === 'docker-engine' ? (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800">
                    Live Docker Engine Socket
                  </span>
                ) : (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                    Host Process Diagnostics
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-slate-400">
                Inspect raw stdout / stderr logs for diagnosis and debugging.
              </p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Container Dropdown */}
            <select
              value={selectedContainer}
              onChange={(e) => setSelectedContainer(e.target.value)}
              className="bg-slate-900 text-slate-200 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:border-purple-500"
            >
              {containers.length > 0 ? (
                containers.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name} ({c.status})
                  </option>
                ))
              ) : (
                nodes.map((n) => (
                  <option key={n.id} value={n.serviceKey}>
                    {n.serviceKey}
                  </option>
                ))
              )}
            </select>

            {/* Tail count selector */}
            <select
              value={logTail}
              onChange={(e) => setLogTail(Number(e.target.value))}
              className="bg-slate-900 text-slate-200 border border-slate-700 rounded-lg px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-purple-500"
            >
              <option value={50}>Last 50 lines</option>
              <option value={100}>Last 100 lines</option>
              <option value={200}>Last 200 lines</option>
              <option value={500}>Last 500 lines</option>
            </select>

            {/* Refresh Logs Button */}
            <button
              type="button"
              onClick={() => loadLogs(selectedContainer, logTail, logFilter)}
              disabled={loadingLogs}
              title="Refresh Logs"
              className="p-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 transition"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingLogs ? 'animate-spin' : ''}`} />
            </button>

            {/* Copy Logs */}
            <button
              type="button"
              onClick={handleCopyLogs}
              title="Copy All Log Output"
              className="flex items-center gap-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:text-white px-2.5 py-1.5 text-xs font-semibold transition"
            >
              {copiedLogs ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedLogs ? 'Copied' : 'Copy'}</span>
            </button>

            {/* Download Logs */}
            <button
              type="button"
              onClick={handleDownloadLogs}
              title="Download Logs"
              className="p-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 transition"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Filter Input & Auto-Scroll Toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <Filter className="h-3.5 w-3.5 text-slate-500" />
            <input
              type="text"
              value={logFilter}
              onChange={(e) => setLogFilter(e.target.value)}
              placeholder="Search / filter logs (e.g. error, ready, timeout)..."
              className="w-full bg-slate-900 text-slate-200 border border-slate-800 rounded-lg px-3 py-1 text-xs font-mono focus:outline-none focus:border-purple-500"
            />
          </div>

          <div className="flex items-center gap-4 text-slate-400 text-xs">
            <span>Showing {logs.length} lines</span>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="rounded border-slate-700 bg-slate-900 text-purple-600 focus:ring-0"
              />
              <span>Auto-scroll to bottom</span>
            </label>
          </div>
        </div>

        {/* Log Lines Terminal Output */}
        <div className="h-96 overflow-y-auto rounded-xl bg-slate-900/90 p-4 font-mono text-xs text-slate-300 space-y-1 border border-slate-800/80">
          {loadingLogs ? (
            <div className="flex h-full items-center justify-center text-slate-500 gap-2">
              <RefreshCw className="h-4 w-4 animate-spin text-purple-400" />
              <span>Fetching container log stream...</span>
            </div>
          ) : logs.length === 0 ? (
            <div className="flex h-full items-center justify-center text-slate-500">
              <span>No logs found matching your criteria.</span>
            </div>
          ) : (
            logs.map((line, idx) => {
              const isError = line.includes('ERROR') || line.includes('Error:') || line.includes('FATAL');
              const isWarn = line.includes('WARN') || line.includes('warning');
              const isInfo = line.includes('INFO') || line.includes('Listening at') || line.includes('Ready');

              let lineClass = 'text-slate-300';
              if (isError) lineClass = 'text-rose-400 font-semibold bg-rose-950/30 px-1 rounded';
              else if (isWarn) lineClass = 'text-amber-300';
              else if (isInfo) lineClass = 'text-teal-300';

              return (
                <div key={idx} className={`leading-relaxed break-all ${lineClass}`}>
                  {line}
                </div>
              );
            })
          )}
          <div ref={logEndRef} />
        </div>
      </div>
    </div>
  );
};
