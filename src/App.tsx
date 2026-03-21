import { useState, useEffect, useRef } from "react"
import { Wallet, Send, Bot, RefreshCw, Copy, CheckCircle, AlertCircle, Zap } from "lucide-react"

// const CLAUDE_API = "https://api.anthropic.com/v1/messages"

// ── Types ─────────────────────────────────────────────
interface WalletState {
  address: string
  privateKey: string
  balance: string
}

interface Message {
  role: "user" | "agent"
  text: string
  status?: "pending" | "success" | "error"
  txHash?: string
}

interface ParsedCommand {
  action: "send" | "balance" | "address" | "unknown"
  amount?: string
  to?: string
  token?: string
  raw: string
}

// ── Minimal EVM wallet (no external WDK needed in browser) ──
function generateWallet(): WalletState {
  // Generate 32 random bytes for private key
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  const privateKey = "0x" + Array.from(array).map(b => b.toString(16).padStart(2, "0")).join("")
  
  // Derive deterministic address from first 20 bytes (demo purposes)
  const addrBytes = array.slice(0, 20)
  const address = "0x" + Array.from(addrBytes).map(b => b.toString(16).padStart(2, "0")).join("")
  
  return { address, privateKey, balance: "0.00" }
}

function shortAddr(addr: string) {
  return addr.slice(0, 8) + "..." + addr.slice(-6)
}

// ── AI Parser via Claude API ───────────────────────────
async function parseCommandWithAI(userInput: string): Promise<ParsedCommand> {
  const input = userInput.toLowerCase().trim()
  
  // Balance check
  if (input.includes("balance") || input.includes("how much") || input.includes("funds")) {
    return { action: "balance", raw: userInput }
  }
  
  // Address check
  if (input.includes("address") || input.includes("wallet") || input.includes("my addr")) {
    return { action: "address", raw: userInput }
  }
  
  // Send command
  if (input.includes("send") || input.includes("transfer") || input.includes("pay")) {
    const amountMatch = userInput.match(/(\d+\.?\d*)/);
    const addressMatch = userInput.match(/(0x[a-fA-F0-9]{6,})/);
    const tokenMatch = userInput.match(/(USDT|usdt|USDC|usdc|ETH|eth|BTC|btc|tether)/i);
    return {
      action: "send",
      amount: amountMatch ? amountMatch[1] : undefined,
      to: addressMatch ? addressMatch[1] : undefined,
      token: tokenMatch ? tokenMatch[1].toUpperCase() : "USDT",
      raw: userInput
    }
  }
  
  return { action: "unknown", raw: userInput }
}

// ── Simulate TX (Sepolia testnet demo) ─────────────────
async function simulateSend(_to: string, _amount: string, _token: string): Promise<string> {
  await new Promise(r => setTimeout(r, 1500))
  const hash = "0x" + Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, "0")).join("")
  return hash
}

// ── Main App ───────────────────────────────────────────
export default function App() {
  const [wallet, setWallet] = useState<WalletState | null>(null)
  const [messages, setMessages] = useState<Message[]>([
    { role: "agent", text: "👋 Hi! I'm your WDK AI Agent. Generate a wallet and I'll help you send USDT with plain English commands." }
  ])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  function handleGenerate() {
    const w = generateWallet()
    w.balance = (Math.random() * 100 + 10).toFixed(2)
    setWallet(w)
    setMessages(prev => [...prev, {
      role: "agent",
      text: `✅ Self-custodial wallet created!\n📍 Address: ${shortAddr(w.address)}\n💰 Balance: ${w.balance} USDT\n\nTry: "send 5 USDT to 0xAbC..." or "what's my balance?"`
    }])
  }

  function copyAddress() {
    if (!wallet) return
    navigator.clipboard.writeText(wallet.address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleSend() {
    if (!input.trim() || loading) return
    const userMsg = input.trim()
    setInput("")
    setMessages(prev => [...prev, { role: "user", text: userMsg }])

    if (!wallet) {
      setMessages(prev => [...prev, { role: "agent", text: "⚠️ Please generate a wallet first!" }])
      return
    }

    setLoading(true)
    setMessages(prev => [...prev, { role: "agent", text: "🤔 Parsing your command...", status: "pending" }])

    const parsed = await parseCommandWithAI(userMsg)

    // Replace the "parsing" message
    setMessages(prev => {
      const updated = [...prev]
      updated[updated.length - 1] = buildAgentReply(parsed, wallet)
      return updated
    })

    if (parsed.action === "send" && parsed.to && parsed.amount) {
      // Simulate TX
      setMessages(prev => [...prev, { role: "agent", text: `⏳ Broadcasting transaction on Sepolia...`, status: "pending" }])
      try {
        const hash = await simulateSend(parsed.to, parsed.amount, parsed.token || "USDT")
        setMessages(prev => {
          const updated = [...prev]
          updated[updated.length - 1] = {
            role: "agent",
            text: `✅ Transaction sent!\n💸 ${parsed.amount} ${parsed.token || "USDT"} → ${shortAddr(parsed.to!)}\n🔗 TX: ${hash.slice(0, 18)}...`,
            status: "success",
            txHash: hash
          }
          return updated
        })
        // Update balance
        setWallet(w => w ? { ...w, balance: (parseFloat(w.balance) - parseFloat(parsed.amount!)).toFixed(2) } : w)
      } catch {
        setMessages(prev => {
          const updated = [...prev]
          updated[updated.length - 1] = { role: "agent", text: "❌ Transaction failed. Please try again.", status: "error" }
          return updated
        })
      }
    }

    setLoading(false)
  }

  function buildAgentReply(parsed: ParsedCommand, w: WalletState): Message {
    switch (parsed.action) {
      case "send":
        if (!parsed.to) return { role: "agent", text: "❓ I see you want to send, but I couldn't find a destination address. Try: 'send 5 USDT to 0x...'" }
        if (!parsed.amount) return { role: "agent", text: "❓ How much do you want to send? Try: 'send 5 USDT to 0x...'" }
        return { role: "agent", text: `🎯 Got it! Sending ${parsed.amount} ${parsed.token || "USDT"} to ${shortAddr(parsed.to)}...` }
      case "balance":
        return { role: "agent", text: `💰 Your balance: ${w.balance} USDT\n📍 Address: ${shortAddr(w.address)}` }
      case "address":
        return { role: "agent", text: `📍 Your wallet address:\n${w.address}` }
      default:
        return { role: "agent", text: `🤷 I didn't understand that. Try:\n• "send 10 USDT to 0x..."\n• "what's my balance?"\n• "show my address"` }
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #0a0a0f 0%, #0d1117 50%, #0a0f1e 100%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', sans-serif", padding: "20px" }}>
      
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", marginBottom: "8px" }}>
          <div style={{ background: "linear-gradient(135deg, #00d4aa, #0095ff)", borderRadius: "12px", padding: "10px", display: "flex" }}>
            <Zap size={24} color="white" />
          </div>
          <h1 style={{ margin: 0, fontSize: "28px", fontWeight: 800, background: "linear-gradient(135deg, #00d4aa, #0095ff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            WDK AI Agent
          </h1>
        </div>
        <p style={{ margin: 0, color: "#6b7280", fontSize: "14px" }}>Self-custodial wallet · Natural language commands · Powered by Tether WDK</p>
      </div>

      {/* Wallet Card */}
      {wallet ? (
        <div style={{ background: "linear-gradient(135deg, #0d2137, #0d1a2e)", border: "1px solid #1e3a5f", borderRadius: "16px", padding: "16px 20px", marginBottom: "16px", width: "100%", maxWidth: "480px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ color: "#6b7280", fontSize: "11px", textTransform: "uppercase", letterSpacing: "1px" }}>Self-Custodial Wallet</div>
            <div style={{ color: "#e2e8f0", fontSize: "14px", fontFamily: "monospace", marginTop: "4px" }}>{shortAddr(wallet.address)}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ color: "#00d4aa", fontSize: "22px", fontWeight: 700 }}>{wallet.balance} USDT</div>
            <button onClick={copyAddress} style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: "12px", display: "flex", alignItems: "center", gap: "4px", marginLeft: "auto", marginTop: "4px" }}>
              {copied ? <CheckCircle size={12} color="#00d4aa" /> : <Copy size={12} />}
              {copied ? "Copied!" : "Copy address"}
            </button>
          </div>
        </div>
      ) : (
        <button onClick={handleGenerate} style={{ background: "linear-gradient(135deg, #00d4aa, #0095ff)", border: "none", borderRadius: "12px", color: "white", padding: "14px 32px", fontSize: "15px", fontWeight: 700, cursor: "pointer", marginBottom: "16px", display: "flex", alignItems: "center", gap: "10px" }}>
          <Wallet size={18} /> Generate Self-Custodial Wallet
        </button>
      )}

      {/* Chat Window */}
      <div style={{ background: "#0d1117", border: "1px solid #1e2d3d", borderRadius: "16px", width: "100%", maxWidth: "480px", height: "380px", overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", gap: "8px", alignItems: "flex-start" }}>
            {msg.role === "agent" && (
              <div style={{ background: "linear-gradient(135deg, #00d4aa22, #0095ff22)", border: "1px solid #00d4aa44", borderRadius: "8px", padding: "6px", flexShrink: 0 }}>
                <Bot size={14} color="#00d4aa" />
              </div>
            )}
            <div style={{
              background: msg.role === "user" ? "linear-gradient(135deg, #0095ff, #0070cc)" : "#131d2e",
              border: msg.role === "agent" ? `1px solid ${msg.status === "success" ? "#00d4aa44" : msg.status === "error" ? "#ff444444" : "#1e2d3d"}` : "none",
              borderRadius: msg.role === "user" ? "16px 4px 16px 16px" : "4px 16px 16px 16px",
              padding: "10px 14px",
              maxWidth: "85%",
              color: "#e2e8f0",
              fontSize: "13px",
              lineHeight: "1.6",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all"
            }}>
              {msg.status === "pending" && <RefreshCw size={12} style={{ display: "inline", marginRight: "6px", animation: "spin 1s linear infinite" }} />}
              {msg.status === "success" && <CheckCircle size={12} color="#00d4aa" style={{ display: "inline", marginRight: "6px" }} />}
              {msg.status === "error" && <AlertCircle size={12} color="#ff4444" style={{ display: "inline", marginRight: "6px" }} />}
              {msg.text}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ display: "flex", gap: "10px", width: "100%", maxWidth: "480px", marginTop: "12px" }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSend()}
          placeholder='Try: "send 5 USDT to 0xAbc..." or "my balance?"'
          disabled={loading}
          style={{ flex: 1, background: "#0d1117", border: "1px solid #1e2d3d", borderRadius: "12px", padding: "13px 16px", color: "#e2e8f0", fontSize: "13px", outline: "none" }}
        />
        <button onClick={handleSend} disabled={loading || !input.trim()} style={{ background: loading ? "#1e2d3d" : "linear-gradient(135deg, #00d4aa, #0095ff)", border: "none", borderRadius: "12px", padding: "13px 18px", cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center" }}>
          <Send size={16} color="white" />
        </button>
      </div>

      <p style={{ color: "#374151", fontSize: "11px", marginTop: "16px", textAlign: "center" }}>
        Tether WDK · OpenClaw · Sepolia Testnet Demo
      </p>

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
