import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import {
  Activity, ShoppingCart, Clock, CheckCircle2, MessageSquare,
  Send, Package, Bot, User, FileText, TrendingUp, Zap, BarChart3,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Toaster, toast } from "sonner";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, CartesianGrid,
} from "recharts";
import "@/App.css";

/* ═══════ CONSTANTS ═══════ */
const T = "00000000-0000-0000-0000-000000000001";
const C = "00000000-0000-0000-0000-000000000002";
const API = process.env.REACT_APP_TELEFLOW_BACKEND_URL || `${process.env.REACT_APP_BACKEND_URL}/api`;

const SAMPLES = [
  "2kg aloo bhejo",
  "Ramesh ne 5 liter tel liya",
  "3 packet biscuit aur 1 kg sugar chahiye",
  "10 kg rice Suresh ko bhejna hai",
];

/* ═══════ HELPERS ═══════ */
const ago = (d) => {
  if (!d) return "";
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};
const fmt = (d) => d ? new Date(d).toLocaleString() : "-";
const time = (d) => d ? new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";

/* ─── mock chart data (seeded from orders) ─── */
const buildChartData = (orders) => {
  const days = {};
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toLocaleDateString("en-US", { weekday: "short" });
    days[key] = { day: key, orders: 0, revenue: 0 };
  }
  (orders || []).forEach((o) => {
    const d = new Date(o.createdAt || o.created_at);
    const key = d.toLocaleDateString("en-US", { weekday: "short" });
    if (days[key]) {
      days[key].orders += 1;
      days[key].revenue += o.totalAmount || o.total_amount || 0;
    }
  });
  return Object.values(days);
};

const buildItemStats = (orders) => {
  const map = {};
  (orders || []).forEach((o) =>
    (o.items || []).forEach((it) => {
      const n = it.itemName || it.item_name;
      map[n] = (map[n] || 0) + (it.quantity || 0);
    })
  );
  return Object.entries(map)
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 6);
};

/* ═══════ INVOICE GENERATOR ═══════ */
const generateInvoice = (order) => {
  const invNo = `TF-${Date.now().toString(36).toUpperCase()}`;
  const items = (order.items || []).map((it, i) => ({
    no: i + 1,
    name: it.itemName || it.item_name,
    qty: it.quantity,
    price: it.unitPrice || it.unit_price || 10,
    total: (it.quantity || 0) * (it.unitPrice || it.unit_price || 10),
  }));
  const subtotal = items.reduce((s, i) => s + i.total, 0);
  const gst = Math.round(subtotal * 0.18 * 100) / 100;
  return { invNo, items, subtotal, gst, total: subtotal + gst, order, date: new Date().toLocaleDateString() };
};

/* ═══════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════ */

const HealthDot = ({ status }) => {
  const ok = status === "healthy";
  return (
    <div data-testid="teleflow-health-badge" className="flex items-center gap-1.5">
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${ok ? "bg-emerald-400 health-pulse" : "bg-red-400"}`} />
      <span className={`text-xs font-medium ${ok ? "text-emerald-400" : "text-red-400"}`}>
        {ok ? "Live" : "Offline"}
      </span>
    </div>
  );
};

const StatCard = ({ icon: Icon, label, value, cls }) => (
  <div className={`stat-glow ${cls} glass rounded-2xl p-5 flex flex-col gap-2`}>
    <div className="flex items-center justify-between">
      <span className="text-[11px] uppercase tracking-widest text-slate-400 font-medium">{label}</span>
      <div className="p-2 rounded-xl bg-white/5">
        <Icon size={16} className="text-slate-300" />
      </div>
    </div>
    <span className="text-3xl font-bold text-white">{value ?? 0}</span>
  </div>
);

const ConfBadge = ({ v }) => {
  const p = Math.round((v ?? 0) * 100);
  const c = v >= 0.8 ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
    : v >= 0.5 ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
    : "bg-red-500/20 text-red-300 border-red-500/30";
  return <span className={`text-[11px] px-2.5 py-0.5 rounded-full border font-semibold ${c}`}>{p}%</span>;
};

const StatusPill = ({ s }) => {
  const c = (s || "").toLowerCase() === "confirmed"
    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
    : "bg-amber-500/20 text-amber-300 border-amber-500/30";
  return <span className={`text-[11px] px-2.5 py-0.5 rounded-full border capitalize font-semibold ${c}`}>{s}</span>;
};

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass rounded-lg px-3 py-2 text-xs">
      <p className="text-slate-300 font-medium mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="font-semibold">{p.name}: {p.value}</p>
      ))}
    </div>
  );
};

/* ═══════════════════════════════
   MAIN APP
   ═══════════════════════════════ */
const App = () => {
  const [health, setHealth] = useState("checking");
  const [stats, setStats] = useState({});
  const [orders, setOrders] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [logs, setLogs] = useState([]);
  const [aiResult, setAiResult] = useState(null);
  const [chat, setChat] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [invProduct, setInvProduct] = useState("");
  const [invQty, setInvQty] = useState("");
  const [invoice, setInvoice] = useState(null);
  const endRef = useRef(null);

  /* ── loaders ── */
  const lh = () => axios.get(`${API}/health`).then(r => setHealth(r.data.status === "ok" ? "healthy" : "degraded")).catch(() => setHealth("degraded"));
  const ls = () => axios.get(`${API}/stats`, { params: { tenantId: T } }).then(r => setStats(r.data.data || {})).catch(() => {});
  const lo = () => axios.get(`${API}/orders`, { params: { tenantId: T } }).then(r => setOrders(r.data.data || [])).catch(() => {});
  const li = () => axios.get(`${API}/inventory`, { params: { tenantId: T } }).then(r => setInventory(r.data.data || [])).catch(() => {});
  const ll = () => axios.get(`${API}/logs`).then(r => setLogs(r.data.data || [])).catch(() => {});
  const refresh = useCallback(() => Promise.all([ls(), lo(), li(), ll()]), []);

  useEffect(() => {
    (async () => {
      try { await axios.post(`${API}/demo/seed`); } catch {}
      lh();
      refresh();
    })();
  }, []); // eslint-disable-line

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chat]);

  /* ── send ── */
  const send = async () => {
    const txt = input.trim();
    if (!txt || sending) return;
    setInput("");
    setSending(true);
    const uid = Date.now();
    const tid = uid + 1;
    setChat(p => [...p, { role: "user", content: txt, id: uid, time: new Date() },
                        { role: "thinking", content: "", id: tid, time: new Date() }]);
    try {
      const m = await axios.post(`${API}/message`, { tenant_id: T, contact_id: C, text: txt });
      const a = await axios.post(`${API}/process-message/${m.data.data.id}`);
      const r = a.data.data;
      setAiResult(r);
      let reply = `🎯 Intent: ${r.intent} (${Math.round(r.confidence * 100)}%)\n👤 Customer: ${r.customer}\n📦 Items: ${(r.items || []).map(i => `${i.name} × ${i.quantity}`).join(", ")}`;
      if (r.order) {
        reply += `\n✅ Order #${r.order.id.slice(0, 8)} created!`;
        toast.success("Order created automatically!");
      }
      setChat(p => p.filter(m => m.id !== tid).concat({ role: "ai", content: reply, id: Date.now() + 2, time: new Date() }));
      await refresh();
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || "Something went wrong";
      setChat(p => p.filter(m => m.id !== tid).concat({ role: "ai", content: `⚠️ ${msg}`, id: Date.now() + 2, time: new Date() }));
      toast.error(msg);
    } finally { setSending(false); }
  };

  /* ── inventory ── */
  const addInv = async (e) => {
    e.preventDefault();
    if (!invProduct.trim()) return;
    try {
      await axios.post(`${API}/inventory`, { tenantId: T, productName: invProduct.trim(), stockQuantity: Number(invQty) || 0 });
      toast.success("Inventory updated");
      setInvProduct(""); setInvQty("");
      li();
    } catch (err) { toast.error(err?.response?.data?.error || "Failed"); }
  };

  const chartData = buildChartData(orders);
  const itemStats = buildItemStats(orders);

  /* ═══════ RENDER ═══════ */
  return (
    <div data-testid="teleflow-dashboard-shell" className="h-full flex flex-col bg-[#0E1621] text-slate-100 bg-pattern">
      <Toaster richColors position="top-right" />

      {/* ─── HEADER ─── */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-white/5 bg-[#0E1621]/90 backdrop-blur-xl shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-[#2AABEE] to-[#229ED9] shadow-lg shadow-[#2AABEE]/20">
            <Zap size={18} className="text-white" />
          </div>
          <div>
            <h1 data-testid="teleflow-main-title" className="text-lg font-bold text-gradient tracking-tight">
              TeleFlow
            </h1>
            <p data-testid="teleflow-subtitle" className="text-[11px] text-slate-500 tracking-wide">
              Digital Munshi — AI Business Engine
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <HealthDot status={health} />
          <span className="text-[10px] text-slate-600 font-mono hidden md:block">{API}</span>
        </div>
      </header>

      {/* ─── BODY ─── */}
      <div className="flex flex-1 min-h-0">

        {/* ════ LEFT — CHAT ════ */}
        <div className="w-[38%] flex flex-col border-r border-white/5 bg-[#0E1621]">

          {/* chat header */}
          <div className="px-5 py-3 border-b border-white/5 flex items-center gap-3 shrink-0 bg-[#17212B]/80">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#2AABEE] to-[#8B5CF6] flex items-center justify-center avatar-ring">
              <Bot size={18} className="text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-white">TeleFlow AI Assistant</p>
              <p className="text-[11px] text-slate-400">
                {sending ? "typing..." : "online • AI-powered order extraction"}
              </p>
            </div>
          </div>

          {/* messages */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2 chat-scroll bg-[#0E1621]">
            {chat.length === 0 && (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-500">
                <div className="p-4 rounded-2xl bg-white/5">
                  <MessageSquare size={28} className="opacity-40" />
                </div>
                <p className="text-sm font-medium">Start a conversation</p>
                <p className="text-xs text-slate-600">Send a message in Hindi, English, or Hinglish</p>
              </div>
            )}

            {chat.map((m) => {
              if (m.role === "thinking") {
                return (
                  <div key={m.id} className="flex items-end gap-2 msg-enter">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#2AABEE] to-[#229ED9] flex items-center justify-center shrink-0">
                      <Bot size={12} className="text-white" />
                    </div>
                    <div className="bg-[#182533] px-4 py-3 rounded-2xl rounded-bl-md">
                      <span className="thinking-dots text-[#2AABEE]"><span>●</span><span>●</span><span>●</span></span>
                    </div>
                  </div>
                );
              }
              if (m.role === "user") {
                return (
                  <div key={m.id} className="flex flex-col items-end gap-0.5 msg-enter">
                    <div className="bg-[#2B5278] text-white px-4 py-2.5 rounded-2xl rounded-br-md max-w-[80%] text-sm whitespace-pre-wrap shadow-lg shadow-[#2B5278]/20">
                      {m.content}
                    </div>
                    <span className="text-[10px] text-slate-600 px-1">{time(m.time)}</span>
                  </div>
                );
              }
              return (
                <div key={m.id} className="flex items-end gap-2 msg-enter">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#2AABEE] to-[#229ED9] flex items-center justify-center shrink-0">
                    <Bot size={12} className="text-white" />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <div className="bg-[#182533] text-slate-200 px-4 py-2.5 rounded-2xl rounded-bl-md max-w-[80%] text-sm whitespace-pre-wrap">
                      {m.content}
                    </div>
                    <span className="text-[10px] text-slate-600 px-1">{time(m.time)}</span>
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>

          {/* pills */}
          <div className="px-4 py-2 flex gap-2 overflow-x-auto pills-row shrink-0 border-t border-white/5 bg-[#17212B]/40">
            {SAMPLES.map(s => (
              <button key={s} onClick={() => setInput(s)}
                className="whitespace-nowrap bg-[#2AABEE]/10 hover:bg-[#2AABEE]/20 text-[#2AABEE] text-[11px] rounded-full px-3 py-1.5 transition-all shrink-0 border border-[#2AABEE]/20 font-medium">
                {s}
              </button>
            ))}
          </div>

          {/* input */}
          <div className="p-3 flex gap-2 border-t border-white/5 shrink-0 bg-[#17212B]/60">
            <Input value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && send()}
              placeholder="Type a message..."
              disabled={sending}
              className="flex-1 bg-[#242F3D] border-white/5 text-slate-100 text-sm placeholder:text-slate-500 focus-visible:ring-[#2AABEE]/40 rounded-xl"
            />
            <Button onClick={send} disabled={sending || !input.trim()}
              className="bg-[#2AABEE] hover:bg-[#229ED9] text-white rounded-xl px-4 shadow-lg shadow-[#2AABEE]/20 transition-all">
              <Send size={16} />
            </Button>
          </div>
        </div>

        {/* ════ RIGHT — DASHBOARD ════ */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#0E1621]">
          <Tabs defaultValue="overview" className="flex flex-col flex-1 min-h-0">
            <TabsList className="shrink-0 mx-5 mt-3 bg-[#17212B] border border-white/5 rounded-xl p-1">
              <TabsTrigger value="overview" className="data-[state=active]:bg-[#2AABEE]/20 data-[state=active]:text-[#2AABEE] rounded-lg text-xs">Overview</TabsTrigger>
              <TabsTrigger value="orders" className="data-[state=active]:bg-[#2AABEE]/20 data-[state=active]:text-[#2AABEE] rounded-lg text-xs">Orders</TabsTrigger>
              <TabsTrigger value="inventory" className="data-[state=active]:bg-[#2AABEE]/20 data-[state=active]:text-[#2AABEE] rounded-lg text-xs">Inventory</TabsTrigger>
              <TabsTrigger value="ailogs" className="data-[state=active]:bg-[#2AABEE]/20 data-[state=active]:text-[#2AABEE] rounded-lg text-xs">AI Logs</TabsTrigger>
              <TabsTrigger value="invoices" className="data-[state=active]:bg-[#2AABEE]/20 data-[state=active]:text-[#2AABEE] rounded-lg text-xs">Invoices</TabsTrigger>
              <TabsTrigger value="raw" className="data-[state=active]:bg-[#2AABEE]/20 data-[state=active]:text-[#2AABEE] rounded-lg text-xs">JSON</TabsTrigger>
            </TabsList>

            {/* ── OVERVIEW ── */}
            <TabsContent value="overview" className="flex-1 p-5 tab-scroll space-y-5">
              {/* Stats row */}
              <div className="grid grid-cols-4 gap-3">
                <StatCard icon={ShoppingCart} label="Total Orders" value={stats.totalOrders} cls="stat-blue" />
                <StatCard icon={Clock} label="Pending" value={stats.pendingOrders} cls="stat-amber" />
                <StatCard icon={CheckCircle2} label="Confirmed" value={stats.confirmedOrders} cls="stat-green" />
                <StatCard icon={MessageSquare} label="Messages" value={stats.totalMessages} cls="stat-violet" />
              </div>

              {/* Charts row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="glass rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                      <TrendingUp size={14} className="text-[#2AABEE]" /> 7-Day Order Trend
                    </h3>
                  </div>
                  <ResponsiveContainer width="100%" height={140}>
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#2AABEE" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="#2AABEE" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                      <YAxis hide allowDecimals={false} />
                      <Tooltip content={<ChartTooltip />} />
                      <Area type="monotone" dataKey="orders" stroke="#2AABEE" strokeWidth={2} fill="url(#grad)" name="Orders" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                <div className="glass rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                      <BarChart3 size={14} className="text-[#8B5CF6]" /> Top Products
                    </h3>
                  </div>
                  <ResponsiveContainer width="100%" height={140}>
                    <BarChart data={itemStats} barCategoryGap="20%">
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                      <YAxis hide allowDecimals={false} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="qty" fill="#8B5CF6" radius={[6, 6, 0, 0]} name="Quantity" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Recent orders */}
              <div className="glass rounded-2xl p-4">
                <h3 className="text-sm font-semibold text-slate-300 mb-3">Recent Orders</h3>
                {orders.length === 0 ? (
                  <p className="text-sm text-slate-500">No orders yet — send a chat message to create one.</p>
                ) : (
                  <div className="space-y-2">
                    {orders.slice(0, 4).map(o => (
                      <div key={o.id} className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-[#2AABEE]/10 flex items-center justify-center">
                            <Package size={14} className="text-[#2AABEE]" />
                          </div>
                          <div>
                            <p className="text-sm text-white font-medium">{o.contact?.name || "Customer"}</p>
                            <p className="text-[11px] text-slate-500">
                              {(o.items || []).map(i => `${i.itemName}×${i.quantity}`).join(", ") || "—"}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <StatusPill s={o.status} />
                          <span className="text-[10px] text-slate-600">{ago(o.createdAt || o.created_at)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ── ORDERS ── */}
            <TabsContent value="orders" className="flex-1 p-5 tab-scroll">
              <div className="glass rounded-2xl overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/5 hover:bg-transparent">
                      <TableHead className="text-slate-400 text-xs">ID</TableHead>
                      <TableHead className="text-slate-400 text-xs">Customer</TableHead>
                      <TableHead className="text-slate-400 text-xs">Items</TableHead>
                      <TableHead className="text-slate-400 text-xs">Status</TableHead>
                      <TableHead className="text-slate-400 text-xs">Created</TableHead>
                      <TableHead className="text-slate-400 text-xs">Invoice</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center text-slate-500 py-8">No orders yet.</TableCell></TableRow>
                    ) : orders.map(o => (
                      <TableRow key={o.id} className="border-white/5">
                        <TableCell className="font-mono text-xs text-slate-400">{o.id.slice(0, 8)}</TableCell>
                        <TableCell className="text-sm text-slate-200">{o.contact?.name || "—"}</TableCell>
                        <TableCell className="text-xs text-slate-300">{(o.items || []).map(i => `${i.itemName}×${i.quantity}`).join(", ")}</TableCell>
                        <TableCell><StatusPill s={o.status} /></TableCell>
                        <TableCell className="text-xs text-slate-400">{fmt(o.createdAt || o.created_at)}</TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost" onClick={() => setInvoice(generateInvoice(o))}
                            className="text-[#2AABEE] hover:text-[#229ED9] hover:bg-[#2AABEE]/10 text-xs h-7 px-2">
                            <FileText size={12} className="mr-1" /> Invoice
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* ── INVENTORY ── */}
            <TabsContent value="inventory" className="flex-1 p-5 tab-scroll space-y-4">
              <div className="glass rounded-2xl overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/5 hover:bg-transparent">
                      <TableHead className="text-slate-400 text-xs">Product</TableHead>
                      <TableHead className="text-slate-400 text-xs">Stock</TableHead>
                      <TableHead className="text-slate-400 text-xs">Updated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inventory.length === 0 ? (
                      <TableRow><TableCell colSpan={3} className="text-center text-slate-500 py-8">No items.</TableCell></TableRow>
                    ) : inventory.map(inv => (
                      <TableRow key={inv.id} className="border-white/5">
                        <TableCell className="text-sm text-slate-200 font-medium">{inv.productName || inv.product_name}</TableCell>
                        <TableCell className="font-mono text-slate-300">{inv.stockQuantity ?? inv.stock_quantity}</TableCell>
                        <TableCell className="text-xs text-slate-400">{fmt(inv.updatedAt || inv.updated_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <form onSubmit={addInv} className="glass rounded-2xl p-4 space-y-3">
                <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                  <Package size={14} className="text-[#2AABEE]" /> Add / Update Stock
                </h4>
                <div className="flex gap-2">
                  <Input value={invProduct} onChange={e => setInvProduct(e.target.value)} placeholder="Product"
                    className="flex-1 bg-[#242F3D] border-white/5 text-slate-100 text-sm rounded-xl" />
                  <Input type="number" value={invQty} onChange={e => setInvQty(e.target.value)} placeholder="Qty"
                    className="w-24 bg-[#242F3D] border-white/5 text-slate-100 text-sm rounded-xl" />
                  <Button type="submit" className="bg-[#2AABEE] hover:bg-[#229ED9] text-white rounded-xl shadow-lg shadow-[#2AABEE]/20">Save</Button>
                </div>
              </form>
            </TabsContent>

            {/* ── AI LOGS ── */}
            <TabsContent value="ailogs" className="flex-1 p-5 tab-scroll">
              <div className="glass rounded-2xl overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/5 hover:bg-transparent">
                      <TableHead className="text-slate-400 text-xs">Action</TableHead>
                      <TableHead className="text-slate-400 text-xs">Confidence</TableHead>
                      <TableHead className="text-slate-400 text-xs">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.length === 0 ? (
                      <TableRow><TableCell colSpan={3} className="text-center text-slate-500 py-8">No logs yet.</TableCell></TableRow>
                    ) : logs.map(l => (
                      <TableRow key={l.id} className="border-white/5">
                        <TableCell className="text-sm text-slate-200">{l.action}</TableCell>
                        <TableCell><ConfBadge v={l.confidence} /></TableCell>
                        <TableCell className="text-xs text-slate-400">{fmt(l.createdAt || l.created_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* ── INVOICES ── */}
            <TabsContent value="invoices" className="flex-1 p-5 tab-scroll">
              {!invoice ? (
                <div className="glass rounded-2xl p-8 text-center space-y-3">
                  <div className="mx-auto w-14 h-14 rounded-2xl bg-[#2AABEE]/10 flex items-center justify-center">
                    <FileText size={24} className="text-[#2AABEE]" />
                  </div>
                  <p className="text-sm text-slate-400">Click <strong className="text-[#2AABEE]">Invoice</strong> on any order to generate one.</p>
                </div>
              ) : (
                <div className="glass rounded-2xl p-6 max-w-lg mx-auto space-y-4">
                  {/* Invoice header */}
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-gradient">INVOICE</h3>
                      <p className="text-xs text-slate-400">#{invoice.invNo}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-400">Date: {invoice.date}</p>
                      <p className="text-xs text-slate-400">Order: #{invoice.order.id.slice(0, 8)}</p>
                    </div>
                  </div>
                  <div className="h-px bg-white/10" />
                  <div className="flex justify-between text-xs text-slate-400">
                    <div>
                      <p className="font-semibold text-slate-300 text-sm">From: TeleFlow Digital Munshi</p>
                      <p>GSTIN: 27XXXXX1234X1Z5</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-slate-300 text-sm">To: {invoice.order.contact?.name || "Customer"}</p>
                    </div>
                  </div>
                  <div className="h-px bg-white/10" />
                  {/* items table */}
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-slate-500 border-b border-white/5">
                        <th className="text-left py-2">#</th>
                        <th className="text-left py-2">Item</th>
                        <th className="text-right py-2">Qty</th>
                        <th className="text-right py-2">Price</th>
                        <th className="text-right py-2">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoice.items.map(it => (
                        <tr key={it.no} className="border-b border-white/5">
                          <td className="py-2 text-slate-400">{it.no}</td>
                          <td className="py-2 text-slate-200">{it.name}</td>
                          <td className="py-2 text-right text-slate-300">{it.qty}</td>
                          <td className="py-2 text-right text-slate-300">₹{it.price}</td>
                          <td className="py-2 text-right text-white font-medium">₹{it.total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="h-px bg-white/10" />
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between text-slate-400"><span>Subtotal</span><span>₹{invoice.subtotal}</span></div>
                    <div className="flex justify-between text-slate-400"><span>GST (18%)</span><span>₹{invoice.gst}</span></div>
                    <div className="flex justify-between text-white font-bold text-sm pt-1 border-t border-white/10">
                      <span>Total</span><span>₹{invoice.total}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button onClick={() => { toast.success("Invoice sent to customer!"); }}
                      className="flex-1 bg-[#2AABEE] hover:bg-[#229ED9] text-white rounded-xl shadow-lg shadow-[#2AABEE]/20">
                      <Send size={14} className="mr-2" /> Send to Customer
                    </Button>
                    <Button variant="ghost" onClick={() => setInvoice(null)}
                      className="text-slate-400 hover:text-white hover:bg-white/5 rounded-xl">
                      Close
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* ── RAW JSON ── */}
            <TabsContent value="raw" className="flex-1 p-5 tab-scroll">
              <div className="glass rounded-2xl overflow-hidden">
                <pre className="p-5 text-xs font-mono text-slate-300 overflow-auto max-h-[calc(100vh-180px)]">
                  {aiResult ? JSON.stringify(aiResult, null, 2) : "Process a message to see the AI structured output here."}
                </pre>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default App;
