import { useState, useEffect, useRef } from "react";
import axios from "axios";
import {
  Activity,
  ShoppingCart,
  Clock,
  CheckCircle2,
  MessageSquare,
  Send,
  Package,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Toaster, toast } from "sonner";
import "@/App.css";

/* ───────── constants ───────── */
const DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001";
const DEFAULT_CONTACT_ID = "00000000-0000-0000-0000-000000000002";
const API_BASE =
  process.env.REACT_APP_TELEFLOW_BACKEND_URL ||
  `${process.env.REACT_APP_BACKEND_URL}/api`;

const SAMPLE_MESSAGES = [
  "2kg aloo bhejo",
  "Ramesh ne 5 liter tel liya",
  "3 packet biscuit aur 1 kg sugar chahiye",
  "10 kg rice Suresh ko bhejna hai",
];

/* ───────── helpers ───────── */
const timeAgo = (date) => {
  if (!date) return "-";
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

const fmtDate = (d) => (d ? new Date(d).toLocaleString() : "-");

/* ───────── tiny sub-components ───────── */
const HealthBadge = ({ status }) => {
  const live = status === "healthy";
  return (
    <div
      data-testid="teleflow-health-badge"
      className="flex items-center gap-1.5 text-xs"
    >
      <span
        className={`inline-block h-2 w-2 rounded-full ${
          live ? "bg-emerald-400 animate-pulse" : "bg-red-400"
        }`}
      />
      <span className={live ? "text-emerald-400" : "text-red-400"}>
        {live ? "Live" : "Offline"}
      </span>
    </div>
  );
};

const StatCard = ({ icon: Icon, label, value, color }) => (
  <div
    className={`stat-card rounded-xl border border-slate-700/60 bg-slate-800/70 p-4 flex flex-col gap-1`}
  >
    <div className="flex items-center justify-between">
      <span className="text-xs text-slate-400 uppercase tracking-wide">
        {label}
      </span>
      <Icon size={16} className={color} />
    </div>
    <span className="text-2xl font-bold text-slate-100">
      {value ?? "-"}
    </span>
  </div>
);

const ConfidenceBadge = ({ value }) => {
  const pct = Math.round((value ?? 0) * 100);
  let cls = "bg-red-900/60 text-red-300 border-red-700/40";
  if (value >= 0.8) cls = "bg-emerald-900/60 text-emerald-300 border-emerald-700/40";
  else if (value >= 0.5) cls = "bg-yellow-900/60 text-yellow-300 border-yellow-700/40";
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border ${cls}`}>
      {pct}%
    </span>
  );
};

const StatusBadge = ({ status }) => {
  const s = (status || "").toLowerCase();
  const cls =
    s === "confirmed"
      ? "bg-emerald-900/60 text-emerald-300 border-emerald-700/40"
      : "bg-yellow-900/60 text-yellow-300 border-yellow-700/40";
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border capitalize ${cls}`}>
      {status}
    </span>
  );
};

/* ═══════════════════════════════════════
   MAIN APP
   ═══════════════════════════════════════ */
const App = () => {
  /* ── state ── */
  const [healthStatus, setHealthStatus] = useState("checking");
  const [stats, setStats] = useState({});
  const [orders, setOrders] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [logs, setLogs] = useState([]);
  const [latestAiResult, setLatestAiResult] = useState(null);

  const [chatMessages, setChatMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [customerName, setCustomerName] = useState("Customer");
  const [sending, setSending] = useState(false);

  // inventory form
  const [invProduct, setInvProduct] = useState("");
  const [invQty, setInvQty] = useState("");

  const chatEndRef = useRef(null);

  /* ── data loaders ── */
  const loadHealth = async () => {
    try {
      const r = await axios.get(`${API_BASE}/health`);
      setHealthStatus(r.data.status === "ok" ? "healthy" : "degraded");
    } catch {
      setHealthStatus("degraded");
    }
  };
  const loadStats = () =>
    axios
      .get(`${API_BASE}/stats`, { params: { tenantId: DEFAULT_TENANT_ID } })
      .then((r) => setStats(r.data.data || {}))
      .catch(() => {});
  const loadOrders = () =>
    axios
      .get(`${API_BASE}/orders`, { params: { tenantId: DEFAULT_TENANT_ID } })
      .then((r) => setOrders(r.data.data || []))
      .catch(() => {});
  const loadInventory = () =>
    axios
      .get(`${API_BASE}/inventory`, {
        params: { tenantId: DEFAULT_TENANT_ID },
      })
      .then((r) => setInventory(r.data.data || []))
      .catch(() => {});
  const loadLogs = () =>
    axios
      .get(`${API_BASE}/logs`)
      .then((r) => setLogs(r.data.data || []))
      .catch(() => {});

  const refreshAll = () =>
    Promise.all([loadStats(), loadOrders(), loadInventory(), loadLogs()]);

  /* ── mount ── */
  useEffect(() => {
    (async () => {
      try {
        await axios.post(`${API_BASE}/demo/seed`);
      } catch {
        /* ignore */
      }
      loadHealth();
      refreshAll();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── auto-scroll chat ── */
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  /* ── send message ── */
  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || sending) return;

    setInputText("");
    setSending(true);

    const userId = Date.now();
    const thinkingId = userId + 1;

    setChatMessages((prev) => [
      ...prev,
      { role: "user", content: text, id: userId },
      { role: "thinking", content: "", id: thinkingId },
    ]);

    try {
      // 1. store message
      const msgRes = await axios.post(`${API_BASE}/message`, {
        tenant_id: DEFAULT_TENANT_ID,
        contact_id: DEFAULT_CONTACT_ID,
        text,
      });
      const messageId = msgRes.data.data.id;

      // 2. AI process
      const aiRes = await axios.post(`${API_BASE}/process-message/${messageId}`);
      const aiResult = aiRes.data.data;
      setLatestAiResult(aiResult);

      // 3. remove thinking, add AI reply
      let reply =
        `🎯 Intent: ${aiResult.intent} (${Math.round(aiResult.confidence * 100)}% confidence)\n` +
        `👤 Customer: ${aiResult.customer}\n` +
        `📦 Items: ${(aiResult.items || []).map((i) => `${i.name} × ${i.quantity}`).join(", ")}`;

      if (aiResult.order) {
        reply += `\n✅ Order #${aiResult.order.id.slice(0, 8)} created automatically!`;
        toast.success("Order created!");
      }

      setChatMessages((prev) =>
        prev
          .filter((m) => m.id !== thinkingId)
          .concat({ role: "ai", content: reply, id: Date.now() + 2 })
      );

      // 4. refresh dashboard
      await refreshAll();
    } catch (err) {
      const errMsg =
        err?.response?.data?.error || err?.message || "Something went wrong";
      setChatMessages((prev) =>
        prev
          .filter((m) => m.id !== thinkingId)
          .concat({
            role: "ai",
            content: `⚠️ Error: ${errMsg}`,
            id: Date.now() + 2,
          })
      );
      toast.error(errMsg);
    } finally {
      setSending(false);
    }
  };

  /* ── inventory form ── */
  const handleAddInventory = async (e) => {
    e.preventDefault();
    if (!invProduct.trim()) return;
    try {
      await axios.post(`${API_BASE}/inventory`, {
        tenantId: DEFAULT_TENANT_ID,
        productName: invProduct.trim(),
        stockQuantity: Number(invQty) || 0,
      });
      toast.success("Inventory updated");
      setInvProduct("");
      setInvQty("");
      loadInventory();
    } catch (err) {
      toast.error(err?.response?.data?.error || "Failed to update inventory");
    }
  };

  /* ═══════════════════════════
     RENDER
     ═══════════════════════════ */
  return (
    <div
      data-testid="teleflow-dashboard-shell"
      className="h-full flex flex-col bg-slate-900 text-slate-100"
    >
      <Toaster richColors position="top-right" />

      {/* ─── HEADER ─── */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-slate-700/60 bg-slate-900/95 backdrop-blur shrink-0">
        <div>
          <h1
            data-testid="teleflow-main-title"
            className="text-lg font-bold text-indigo-400 tracking-tight"
          >
            ⚡ TeleFlow
          </h1>
          <p
            data-testid="teleflow-subtitle"
            className="text-xs text-slate-400"
          >
            Digital Munshi — AI Business Engine
          </p>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <HealthBadge status={healthStatus} />
          <span className="text-[10px] text-slate-500 font-mono truncate max-w-[220px]">
            {API_BASE}
          </span>
        </div>
      </header>

      {/* ─── BODY ─── */}
      <div className="flex flex-1 min-h-0">
        {/* ════════ LEFT PANEL — CHAT ════════ */}
        <div className="w-[40%] flex flex-col border-r border-slate-700/60 bg-slate-900">
          {/* customer name */}
          <div className="px-4 py-3 border-b border-slate-700/40 bg-slate-800/40 shrink-0">
            <label className="block text-[11px] text-slate-400 mb-1 uppercase tracking-wider">
              Customer Name
            </label>
            <Input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Customer"
              className="bg-slate-800 border-slate-600 text-slate-100 h-8 text-sm"
            />
          </div>

          {/* chat bubbles */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 chat-scroll">
            {chatMessages.length === 0 && (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-500 gap-2">
                <MessageSquare size={32} className="opacity-30" />
                <p className="text-sm">Send a message to get started</p>
                <p className="text-xs text-slate-600">
                  Try a sample below ↓
                </p>
              </div>
            )}

            {chatMessages.map((msg) => {
              if (msg.role === "thinking") {
                return (
                  <div key={msg.id} className="flex justify-start">
                    <div className="bg-slate-800 text-slate-400 italic px-4 py-2.5 rounded-2xl rounded-bl-sm max-w-[80%] text-sm">
                      <span className="thinking-dots">
                        <span>●</span>
                        <span>●</span>
                        <span>●</span>
                      </span>
                    </div>
                  </div>
                );
              }
              if (msg.role === "user") {
                return (
                  <div key={msg.id} className="flex justify-end">
                    <div className="bg-indigo-600 text-white px-4 py-2.5 rounded-2xl rounded-br-sm max-w-[80%] text-sm whitespace-pre-wrap shadow-lg shadow-indigo-900/30">
                      {msg.content}
                    </div>
                  </div>
                );
              }
              /* role === "ai" */
              return (
                <div key={msg.id} className="flex justify-start">
                  <div className="bg-slate-700 text-slate-200 px-4 py-2.5 rounded-2xl rounded-bl-sm max-w-[80%] text-sm whitespace-pre-wrap">
                    {msg.content}
                  </div>
                </div>
              );
            })}
            <div ref={chatEndRef} />
          </div>

          {/* sample pills */}
          <div className="px-4 py-2 flex gap-2 overflow-x-auto sample-row shrink-0 border-t border-slate-800/60">
            {SAMPLE_MESSAGES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setInputText(s)}
                className="whitespace-nowrap bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-full px-3 py-1 transition-colors shrink-0"
              >
                {s}
              </button>
            ))}
          </div>

          {/* input row */}
          <div className="p-3 flex gap-2 border-t border-slate-700/60 shrink-0 bg-slate-800/30">
            <Input
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Type a message or pick a sample..."
              className="flex-1 bg-slate-800 border-slate-600 text-slate-100 text-sm"
              disabled={sending}
            />
            <Button
              onClick={handleSend}
              disabled={sending || !inputText.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-4"
            >
              <Send size={16} />
            </Button>
          </div>
        </div>

        {/* ════════ RIGHT PANEL — DASHBOARD ════════ */}
        <div className="flex-1 flex flex-col min-w-0">
          <Tabs defaultValue="overview" className="flex flex-col flex-1 min-h-0">
            <TabsList className="shrink-0 mx-4 mt-3 bg-slate-800/80 border border-slate-700/50 rounded-lg">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="orders">Orders</TabsTrigger>
              <TabsTrigger value="inventory">Inventory</TabsTrigger>
              <TabsTrigger value="ailogs">AI Logs</TabsTrigger>
              <TabsTrigger value="raw">Raw JSON</TabsTrigger>
            </TabsList>

            {/* ── OVERVIEW ── */}
            <TabsContent value="overview" className="flex-1 p-4 tab-scroll">
              <div className="grid grid-cols-2 gap-3 mb-5">
                <StatCard
                  icon={ShoppingCart}
                  label="Total Orders"
                  value={stats.totalOrders}
                  color="text-indigo-400"
                />
                <StatCard
                  icon={Clock}
                  label="Pending"
                  value={stats.pendingOrders}
                  color="text-yellow-400"
                />
                <StatCard
                  icon={CheckCircle2}
                  label="Confirmed"
                  value={stats.confirmedOrders}
                  color="text-emerald-400"
                />
                <StatCard
                  icon={MessageSquare}
                  label="Messages"
                  value={stats.totalMessages}
                  color="text-blue-400"
                />
              </div>

              <h3 className="text-sm font-semibold text-slate-300 mb-3">
                Recent Orders
              </h3>
              {orders.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No orders yet — send a chat message to create one.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {orders.slice(0, 5).map((o) => (
                    <Card
                      key={o.id}
                      className="bg-slate-800/60 border-slate-700/50"
                    >
                      <CardContent className="p-3 flex items-center justify-between">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs font-mono text-slate-400">
                            #{o.id.slice(0, 8)}
                          </span>
                          <span className="text-sm text-slate-200">
                            {o.contact?.name || "Unknown"}
                          </span>
                          <span className="text-xs text-slate-400">
                            {(o.items || [])
                              .map((i) => `${i.itemName}×${i.quantity}`)
                              .join(", ") || "—"}
                          </span>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <StatusBadge status={o.status} />
                          <span className="text-[10px] text-slate-500">
                            {timeAgo(o.createdAt || o.created_at)}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* ── ORDERS ── */}
            <TabsContent value="orders" className="flex-1 p-4 tab-scroll">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-slate-400">ID</TableHead>
                    <TableHead className="text-slate-400">Customer</TableHead>
                    <TableHead className="text-slate-400">Items</TableHead>
                    <TableHead className="text-slate-400">Status</TableHead>
                    <TableHead className="text-slate-400">Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="text-center text-slate-500"
                      >
                        No orders found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    orders.map((o) => (
                      <TableRow key={o.id} className="border-slate-700/50">
                        <TableCell className="font-mono text-xs text-slate-400">
                          {o.id.slice(0, 8)}
                        </TableCell>
                        <TableCell className="text-slate-200">
                          {o.contact?.name || "—"}
                        </TableCell>
                        <TableCell className="text-slate-300 text-xs">
                          {(o.items || [])
                            .map((i) => `${i.itemName}×${i.quantity}`)
                            .join(", ") || "—"}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={o.status} />
                        </TableCell>
                        <TableCell className="text-xs text-slate-400">
                          {fmtDate(o.createdAt || o.created_at)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TabsContent>

            {/* ── INVENTORY ── */}
            <TabsContent value="inventory" className="flex-1 p-4 tab-scroll">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-slate-400">Product</TableHead>
                    <TableHead className="text-slate-400">Stock Qty</TableHead>
                    <TableHead className="text-slate-400">
                      Last Updated
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inventory.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={3}
                        className="text-center text-slate-500"
                      >
                        No inventory items.
                      </TableCell>
                    </TableRow>
                  ) : (
                    inventory.map((inv) => (
                      <TableRow
                        key={inv.id}
                        className="border-slate-700/50"
                      >
                        <TableCell className="text-slate-200">
                          {inv.productName || inv.product_name}
                        </TableCell>
                        <TableCell className="font-mono text-slate-300">
                          {inv.stockQuantity ?? inv.stock_quantity}
                        </TableCell>
                        <TableCell className="text-xs text-slate-400">
                          {fmtDate(inv.updatedAt || inv.updated_at)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              {/* add / update form */}
              <form
                onSubmit={handleAddInventory}
                className="mt-5 p-4 rounded-xl bg-slate-800/50 border border-slate-700/40 flex flex-col gap-3"
              >
                <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                  <Package size={14} /> Add / Update Stock
                </h4>
                <div className="flex gap-2">
                  <Input
                    value={invProduct}
                    onChange={(e) => setInvProduct(e.target.value)}
                    placeholder="Product name"
                    className="flex-1 bg-slate-800 border-slate-600 text-slate-100 text-sm"
                  />
                  <Input
                    type="number"
                    value={invQty}
                    onChange={(e) => setInvQty(e.target.value)}
                    placeholder="Qty"
                    className="w-24 bg-slate-800 border-slate-600 text-slate-100 text-sm"
                  />
                  <Button
                    type="submit"
                    className="bg-indigo-600 hover:bg-indigo-500 text-white"
                  >
                    Save
                  </Button>
                </div>
              </form>
            </TabsContent>

            {/* ── AI LOGS ── */}
            <TabsContent value="ailogs" className="flex-1 p-4 tab-scroll">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-slate-400">Action</TableHead>
                    <TableHead className="text-slate-400">
                      Confidence
                    </TableHead>
                    <TableHead className="text-slate-400">Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={3}
                        className="text-center text-slate-500"
                      >
                        No AI logs yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    logs.map((log) => (
                      <TableRow
                        key={log.id}
                        className="border-slate-700/50"
                      >
                        <TableCell className="text-slate-200">
                          {log.action}
                        </TableCell>
                        <TableCell>
                          <ConfidenceBadge value={log.confidence} />
                        </TableCell>
                        <TableCell className="text-xs text-slate-400">
                          {fmtDate(log.createdAt || log.created_at)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TabsContent>

            {/* ── RAW JSON ── */}
            <TabsContent value="raw" className="flex-1 p-4 tab-scroll">
              <pre className="bg-slate-950 rounded-xl p-4 text-xs font-mono text-slate-300 overflow-auto max-h-[calc(100vh-180px)] border border-slate-800">
                {latestAiResult
                  ? JSON.stringify(latestAiResult, null, 2)
                  : 'Run "Process" on a message to view structured JSON output.'}
              </pre>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default App;
