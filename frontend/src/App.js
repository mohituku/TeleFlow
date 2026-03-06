import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Activity, Bot, FileText, ListChecks, Sparkles } from "lucide-react";
import "@/App.css";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Toaster, toast } from "sonner";

const API_BASE =
  process.env.REACT_APP_TELEFLOW_BACKEND_URL || `${process.env.REACT_APP_BACKEND_URL}/api`;

const initialFormState = {
  tenant_id: "",
  contact_id: "",
  text: "",
  voice_url: "",
  transcript: "",
};

const HealthBadge = ({ status }) => {
  const isHealthy = status === "healthy";

  return (
    <Badge
      data-testid="teleflow-health-badge"
      className={`teleflow-health-badge ${isHealthy ? "healthy" : "unhealthy"}`}
    >
      <Activity size={14} />
      <span data-testid="teleflow-health-status-text">{isHealthy ? "Healthy" : "Degraded"}</span>
    </Badge>
  );
};

const App = () => {
  const [health, setHealth] = useState("checking");
  const [messages, setMessages] = useState([]);
  const [logs, setLogs] = useState([]);
  const [formState, setFormState] = useState(initialFormState);
  const [loading, setLoading] = useState({
    submit: false,
    messages: false,
    logs: false,
  });
  const [processingId, setProcessingId] = useState("");
  const [latestAiResult, setLatestAiResult] = useState(null);

  const formatDate = useMemo(
    () =>
      (rawDate) => {
        if (!rawDate) {
          return "-";
        }
        return new Date(rawDate).toLocaleString();
      },
    [],
  );

  const loadHealth = async () => {
    try {
      const response = await axios.get(`${API_BASE}/health`);
      setHealth(response.data.status === "ok" ? "healthy" : "degraded");
    } catch (e) {
      setHealth("degraded");
      toast.error("Unable to load service health.");
    }
  };

  const loadMessages = async () => {
    setLoading((prev) => ({ ...prev, messages: true }));
    try {
      const response = await axios.get(`${API_BASE}/messages`);
      setMessages(response.data.data || []);
    } catch (e) {
      toast.error("Unable to load messages.");
    } finally {
      setLoading((prev) => ({ ...prev, messages: false }));
    }
  };

  const loadLogs = async () => {
    setLoading((prev) => ({ ...prev, logs: true }));
    try {
      const response = await axios.get(`${API_BASE}/logs`);
      setLogs(response.data.data || []);
    } catch (e) {
      toast.error("Unable to load AI logs.");
    } finally {
      setLoading((prev) => ({ ...prev, logs: false }));
    }
  };

  useEffect(() => {
    loadHealth();
    loadMessages();
    loadLogs();
  }, []);

  const onInputChange = (event) => {
    const { name, value } = event.target;
    setFormState((prev) => ({ ...prev, [name]: value }));
  };

  const submitMessage = async (event) => {
    event.preventDefault();

    setLoading((prev) => ({ ...prev, submit: true }));
    try {
      const payload = {
        tenant_id: formState.tenant_id,
        contact_id: formState.contact_id,
        text: formState.text || undefined,
        voice_url: formState.voice_url || undefined,
        transcript: formState.transcript || undefined,
      };

      await axios.post(`${API_BASE}/message`, payload);
      setFormState(initialFormState);
      toast.success("Message stored successfully.");
      await Promise.all([loadMessages(), loadLogs()]);
    } catch (e) {
      const apiError = e?.response?.data?.error;
      toast.error(apiError || "Failed to store message.");
    } finally {
      setLoading((prev) => ({ ...prev, submit: false }));
    }
  };

  const processMessage = async (messageId) => {
    setProcessingId(messageId);
    try {
      const response = await axios.post(`${API_BASE}/process-message/${messageId}`);
      setLatestAiResult(response.data.data);
      toast.success("AI processing completed.");
      await loadLogs();
    } catch (e) {
      const apiError = e?.response?.data?.error;
      toast.error(apiError || "AI processing failed.");
    } finally {
      setProcessingId("");
    }
  };

  return (
    <div className="teleflow-shell" data-testid="teleflow-dashboard-shell">
      <Toaster richColors position="top-right" />

      <main className="teleflow-container">
        <section className="teleflow-header-panel" data-testid="teleflow-header-panel">
          <div className="teleflow-header-left">
            <p className="teleflow-overline" data-testid="teleflow-overline">
              Digital Munshi
            </p>
            <h1 className="teleflow-heading" data-testid="teleflow-main-title">
              TeleFlow Command Dashboard
            </h1>
            <p className="teleflow-subtitle" data-testid="teleflow-subtitle">
              Capture business chat, run AI intent parsing, and audit every extraction in one place.
            </p>
          </div>
          <div className="teleflow-header-right" data-testid="teleflow-health-container">
            <HealthBadge status={health} />
            <p className="teleflow-api-base" data-testid="teleflow-api-base-url">
              API: {API_BASE}
            </p>
          </div>
        </section>

        <section className="teleflow-grid" data-testid="teleflow-main-grid">
          <Card className="teleflow-card teleflow-form-card" data-testid="teleflow-message-form-card">
            <CardHeader>
              <CardTitle className="teleflow-card-title">
                <Bot size={18} /> New Incoming Message
              </CardTitle>
              <CardDescription data-testid="teleflow-message-form-description">
                Store customer text/voice data before AI processing.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="teleflow-form" onSubmit={submitMessage} data-testid="teleflow-message-form">
                <div className="teleflow-form-field">
                  <label htmlFor="tenant_id" data-testid="teleflow-tenant-id-label">
                    Tenant ID
                  </label>
                  <Input
                    id="tenant_id"
                    name="tenant_id"
                    value={formState.tenant_id}
                    onChange={onInputChange}
                    placeholder="UUID"
                    data-testid="teleflow-tenant-id-input"
                    required
                  />
                </div>

                <div className="teleflow-form-field">
                  <label htmlFor="contact_id" data-testid="teleflow-contact-id-label">
                    Contact ID
                  </label>
                  <Input
                    id="contact_id"
                    name="contact_id"
                    value={formState.contact_id}
                    onChange={onInputChange}
                    placeholder="UUID"
                    data-testid="teleflow-contact-id-input"
                    required
                  />
                </div>

                <div className="teleflow-form-field">
                  <label htmlFor="text" data-testid="teleflow-text-label">
                    Message Text
                  </label>
                  <Textarea
                    id="text"
                    name="text"
                    value={formState.text}
                    onChange={onInputChange}
                    placeholder="Example: Ramesh bought 2kg rice"
                    data-testid="teleflow-text-input"
                  />
                </div>

                <div className="teleflow-form-field">
                  <label htmlFor="voice_url" data-testid="teleflow-voice-url-label">
                    Voice URL
                  </label>
                  <Input
                    id="voice_url"
                    name="voice_url"
                    value={formState.voice_url}
                    onChange={onInputChange}
                    placeholder="https://..."
                    data-testid="teleflow-voice-url-input"
                  />
                </div>

                <div className="teleflow-form-field">
                  <label htmlFor="transcript" data-testid="teleflow-transcript-label">
                    Transcript
                  </label>
                  <Textarea
                    id="transcript"
                    name="transcript"
                    value={formState.transcript}
                    onChange={onInputChange}
                    placeholder="Voice transcript if available"
                    data-testid="teleflow-transcript-input"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={loading.submit}
                  className="teleflow-submit-button"
                  data-testid="teleflow-submit-message-button"
                >
                  {loading.submit ? "Saving..." : "Store Message"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="teleflow-card" data-testid="teleflow-messages-table-card">
            <CardHeader>
              <CardTitle className="teleflow-card-title">
                <ListChecks size={18} /> Message Queue
              </CardTitle>
              <CardDescription data-testid="teleflow-messages-count-text">
                {messages.length} messages available for AI processing.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table data-testid="teleflow-messages-table">
                <TableHeader>
                  <TableRow>
                    <TableHead data-testid="teleflow-messages-header-id">ID</TableHead>
                    <TableHead data-testid="teleflow-messages-header-text">Text</TableHead>
                    <TableHead data-testid="teleflow-messages-header-created">Created At</TableHead>
                    <TableHead data-testid="teleflow-messages-header-action">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading.messages ? (
                    <TableRow>
                      <TableCell colSpan={4} data-testid="teleflow-messages-loading">
                        Loading messages...
                      </TableCell>
                    </TableRow>
                  ) : messages.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} data-testid="teleflow-messages-empty-state">
                        No messages found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    messages.map((message) => (
                      <TableRow
                        key={message.id}
                        data-testid={`teleflow-message-row-${message.id}`}
                        className="teleflow-table-row"
                      >
                        <TableCell className="teleflow-mono" data-testid={`teleflow-message-id-${message.id}`}>
                          {message.id.slice(0, 8)}...
                        </TableCell>
                        <TableCell data-testid={`teleflow-message-text-${message.id}`}>
                          {message.text || message.transcript || "(voice only)"}
                        </TableCell>
                        <TableCell data-testid={`teleflow-message-created-at-${message.id}`}>
                          {formatDate(message.created_at || message.createdAt)}
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => processMessage(message.id)}
                            disabled={processingId === message.id}
                            data-testid={`teleflow-process-message-button-${message.id}`}
                          >
                            {processingId === message.id ? "Processing..." : "Process"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="teleflow-card teleflow-ai-card" data-testid="teleflow-ai-output-card">
            <CardHeader>
              <CardTitle className="teleflow-card-title">
                <Sparkles size={18} /> AI Structured Output
              </CardTitle>
              <CardDescription data-testid="teleflow-ai-output-description">
                Latest extracted intent from selected message.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="teleflow-json-block" data-testid="teleflow-ai-output-json">
                {latestAiResult
                  ? JSON.stringify(latestAiResult, null, 2)
                  : "Run \"Process\" on a message to view structured JSON output."}
              </pre>
            </CardContent>
          </Card>

          <Card className="teleflow-card teleflow-logs-card" data-testid="teleflow-logs-table-card">
            <CardHeader>
              <CardTitle className="teleflow-card-title">
                <FileText size={18} /> AI Actions Log
              </CardTitle>
              <CardDescription data-testid="teleflow-logs-count-text">
                Immutable trail for prompt, response, and confidence.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table data-testid="teleflow-logs-table">
                <TableHeader>
                  <TableRow>
                    <TableHead data-testid="teleflow-logs-header-action">Action</TableHead>
                    <TableHead data-testid="teleflow-logs-header-confidence">Confidence</TableHead>
                    <TableHead data-testid="teleflow-logs-header-created">Created At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading.logs ? (
                    <TableRow>
                      <TableCell colSpan={3} data-testid="teleflow-logs-loading">
                        Loading logs...
                      </TableCell>
                    </TableRow>
                  ) : logs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} data-testid="teleflow-logs-empty-state">
                        No AI logs yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    logs.map((log) => (
                      <TableRow key={log.id} data-testid={`teleflow-log-row-${log.id}`}>
                        <TableCell data-testid={`teleflow-log-action-${log.id}`}>{log.action}</TableCell>
                        <TableCell data-testid={`teleflow-log-confidence-${log.id}`}>
                          {typeof log.confidence === "number"
                            ? log.confidence.toFixed(2)
                            : Number(log.confidence || 0).toFixed(2)}
                        </TableCell>
                        <TableCell data-testid={`teleflow-log-created-at-${log.id}`}>
                          {formatDate(log.created_at || log.createdAt)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
};

export default App;
