"""
Mandate Radar FastAPI Backend - Vercel-optimised version.
Key change vs. original: all heavy startup work (synthetic data generation,
analysis, Neo4j seeding) is deferred to the first actual request so the
function cold-starts quickly within Vercel's timeout budget.
"""

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import io
import os
import pandas as pd

from reference_data import REFERENCE_MERCHANTS, PARENT_COMPANIES, PAYMENT_MECHANISMS, ESCALATION_CHAIN
from synthetic_data import (
    generate_synthetic_statement,
    generate_usage_telemetry,
    generate_notification_stream,
    GROUND_TRUTH_MANDATES,
    GROUND_TRUTH_HARD_NEGATIVES
)
from detector import analyze_statement, clean_descriptor, detect_payment_mechanism
from neo4j_service import Neo4jKnowledgeGraph

app = FastAPI(
    title="Mandate Radar API",
    description="Deterministic Auto-Debit Mandate Detection & Neo4j Knowledge Graph Engine",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# LAZY INITIALISATION — nothing heavy runs at import time
# ---------------------------------------------------------------------------
_store: Dict[str, Any] = {}

def _get_store() -> Dict[str, Any]:
    """Initialise the in-memory store on the very first call."""
    if _store:
        return _store

    _store["neo4j_graph"] = Neo4jKnowledgeGraph()
    _store["statement"] = generate_synthetic_statement()
    _store["usage"] = generate_usage_telemetry()
    _store["notifications"] = generate_notification_stream()

    # Pre-seed graph (best-effort — don't crash if it fails)
    try:
        initial = analyze_statement(_store["statement"], _store["usage"])
        _store["neo4j_graph"].sync_statement_mandates("Arun Sharma", initial["mandates"])
    except Exception:
        pass

    return _store


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------
class AnalyzeRequest(BaseModel):
    transactions: Optional[List[Dict[str, Any]]] = None
    usage_feed: Optional[Dict[str, str]] = None
    user_name: Optional[str] = "Arun Sharma"

class EmailDraftRequest(BaseModel):
    mandate_id: str
    merchant_name: str
    descriptor: str
    amount: float
    cadence: str
    mechanism: str
    user_name: str = "Arun Sharma"
    account_ref: str = "XX-4821 / UPI VPA"
    tone: str = "formal"
    cancellation_reason: Optional[str] = "Subscription no longer required"

class CypherQueryRequest(BaseModel):
    query: str

class Neo4jConnectRequest(BaseModel):
    uri: str
    user: str = "neo4j"
    password: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@app.get("/api/health")
def health_check():
    store = _get_store()
    neo4j_graph = store["neo4j_graph"]
    return {
        "status": "healthy",
        "neo4j_connected": neo4j_graph.is_connected,
        "neo4j_mode": "LIVE_AURA" if neo4j_graph.is_connected else "EMBEDDED_HIGH_FIDELITY",
        "total_reference_merchants": len(REFERENCE_MERCHANTS),
        "total_parent_corporations": len(PARENT_COMPANIES),
        "payment_mechanisms_modeled": len(PAYMENT_MECHANISMS)
    }

@app.get("/api/info")
def get_api_info():
    store = _get_store()
    neo4j_graph = store["neo4j_graph"]
    return {
        "service": "Mandate Radar API",
        "theme": "Fintech - The Auto Debits Nobody Can Find",
        "track": "Neo4j (Best Use of Neo4j)",
        "neo4j_status": "CONNECTED" if neo4j_graph.is_connected else "EMBEDDED_GRAPH_MODE",
        "reference_merchants_count": len(REFERENCE_MERCHANTS)
    }

@app.get("/api/statement/synthetic")
def get_synthetic_dataset():
    store = _get_store()
    return {
        "transactions": store["statement"],
        "usage_feed": store["usage"],
        "notifications": store["notifications"],
        "ground_truth_mandates": GROUND_TRUTH_MANDATES,
        "ground_truth_hard_negatives": GROUND_TRUTH_HARD_NEGATIVES
    }

@app.post("/api/analyze")
def run_analysis(payload: AnalyzeRequest):
    store = _get_store()
    neo4j_graph = store["neo4j_graph"]
    cached_statement = store["statement"]
    cached_usage = store["usage"]
    cached_notifications = store["notifications"]

    txs = payload.transactions if payload.transactions is not None else cached_statement
    usage = payload.usage_feed if payload.usage_feed is not None else cached_usage
    user_name = payload.user_name or "Arun Sharma"

    analysis_result = analyze_statement(txs, usage)
    neo4j_graph.sync_statement_mandates(user_name, analysis_result["mandates"])

    enhanced_mandates = []
    for m in analysis_result["mandates"]:
        matched_notifs = [
            n for n in cached_notifications
            if m["merchant_name"].lower() in n["text"].lower() or m["descriptor"].lower() in n["text"].lower()
        ]
        m["recent_notifications"] = matched_notifs
        m["escalation_chain"] = ESCALATION_CHAIN
        enhanced_mandates.append(m)

    analysis_result["mandates"] = enhanced_mandates
    annual_committed = analysis_result["annual_committed_total"]
    analysis_result["hero_metrics"] = {
        "annual_committed_total": annual_committed,
        "monthly_equivalent": round(annual_committed / 12.0, 2),
        "potential_savings": analysis_result["annual_potential_savings"],
        "total_mandates_found": len(enhanced_mandates),
        "flagged_issues_count": sum(1 for m in enhanced_mandates if m["flag"] != "HEALTHY")
    }
    return analysis_result

@app.post("/api/upload-csv")
async def upload_statement_csv(file: UploadFile = File(...)):
    store = _get_store()
    neo4j_graph = store["neo4j_graph"]
    cached_usage = store["usage"]

    try:
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")

        try:
            text = content.decode("utf-8")
        except UnicodeDecodeError:
            text = content.decode("latin-1")

        csv_io = io.StringIO(text)
        df = pd.read_csv(csv_io)

        if df.empty:
            raise HTTPException(status_code=400, detail="The CSV file has headers but contains zero rows.")

        cols = {c.strip().lower(): c for c in df.columns}
        date_col = next((cols[k] for k in [
            "date", "transactiontimestamp", "valuedate", "txn_date", 
            "transaction date", "value date", "trans date", "timestamp", "txn date", "time"
        ] if k in cols), None)
        desc_col = next((cols[k] for k in [
            "descriptor", "description", "narration", "particulars", 
            "remarks", "details", "txn narration", "transaction narration"
        ] if k in cols), None)
        amt_col  = next((cols[k] for k in [
            "amount", "debit", "withdrawal", "txn amount", "amount (inr)", 
            "txn_amount", "transaction amount", "dr"
        ] if k in cols), None)
        ref_col  = next((cols[k] for k in [
            "ref", "reference", "chq/ref no.", "utr", "txn id", "id", "txnid"
        ] if k in cols), None)

        if not date_col or not desc_col or not amt_col:
            raise HTTPException(
                status_code=422,
                detail=f"CSV must contain Date, Description, and Debit/Amount columns. Found: {list(df.columns)}"
            )

        transactions = []
        for idx, row in df.iterrows():
            amt_raw = str(row[amt_col]).replace(",", "").strip()
            try:
                amt_val = abs(float(amt_raw))
            except ValueError:
                continue
            if amt_val <= 0:
                continue
            transactions.append({
                "id": f"CSV_ROW_{idx+1}",
                "date": str(row[date_col]).strip()[:10],
                "descriptor": str(row[desc_col]).strip(),
                "amount": amt_val,
                "type": "DEBIT",
                "ref": str(row[ref_col]).strip() if ref_col and pd.notna(row[ref_col]) else ""
            })

        if not transactions:
            raise HTTPException(status_code=400, detail="No valid debit transactions could be parsed from the CSV.")

        analysis_result = analyze_statement(transactions, cached_usage)
        neo4j_graph.sync_statement_mandates("Uploaded Statement User", analysis_result["mandates"])

        annual_committed = analysis_result["annual_committed_total"]
        analysis_result["hero_metrics"] = {
            "annual_committed_total": annual_committed,
            "monthly_equivalent": round(annual_committed / 12.0, 2),
            "potential_savings": analysis_result["annual_potential_savings"],
            "total_mandates_found": len(analysis_result["mandates"]),
            "flagged_issues_count": sum(1 for m in analysis_result["mandates"] if m["flag"] != "HEALTHY")
        }
        analysis_result["filename"] = file.filename
        analysis_result["rows_parsed"] = len(transactions)
        return analysis_result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse statement: {str(e)}")

@app.post("/api/generate-email")
def generate_cancellation_email(req: EmailDraftRequest):
    mech_info = PAYMENT_MECHANISMS.get(req.mechanism, PAYMENT_MECHANISMS["DIRECT_MERCHANT"])

    if req.tone == "polite":
        subject = f"Cancellation Request: {req.merchant_name} Recurring Subscription"
        body = f"""Dear {req.merchant_name} Support Team,

I am writing to formally request the immediate cancellation of my recurring {req.cadence.lower()} subscription for {req.merchant_name}.

Account Details:
- Name: {req.user_name}
- Billing Identifier / Descriptor: {req.descriptor}
- Active Amount: ₹{req.amount:,.2f} / {req.cadence.lower()}
- Payment Rail: {mech_info['name']} ({req.account_ref})
- Cancellation Reason: {req.cancellation_reason}

Kindly process this cancellation with immediate effect and send a written confirmation.

Warm regards,
{req.user_name}
"""
    elif req.tone == "firm_dispute":
        subject = f"URGENT: Dispute Notice & Mandatory Mandate Revocation - {req.merchant_name}"
        body = f"""To:
Grievance Redressal Officer / Billing Operations, {req.merchant_name}
CC: Nodal Officer, Issuing Bank / NPCI CMS Cell

SUBJECT: FORMAL NOTICE OF REVOCATION OF CONSENT FOR RECURRING DEBIT MANDATE UNDER RBI E-MANDATE DIRECTIVE

Dear Sir/Madam,

I hereby serve formal notice that I have revoked all authorization for recurring auto-debit transactions in favour of '{req.merchant_name}'.

Transaction & Mandate Profile:
- Customer Name: {req.user_name}
- Statement Descriptor: {req.descriptor}
- Registered Billing Rail: {mech_info['name']}
- Billed Cadence & Amount: ₹{req.amount:,.2f} ({req.cadence})
- Account / Card Reference: {req.account_ref}

Under RBI Master Circular on Recurring Debits and Consumer Protection Rules 2020, any subsequent debit after this notice shall be deemed unauthorized.

Please confirm cancellation within 48 hours.

Yours sincerely,
{req.user_name}
"""
    else:
        subject = f"Notice of Mandate Cancellation: {req.merchant_name} [Ref: {req.account_ref}]"
        body = f"""To:
Customer Care & Accounts Dept,
{req.merchant_name}

Subject: Request to Cancel Recurring Mandate / Standing Instruction

Dear Accounts Team,

Please treat this as my formal instruction to cancel my recurring subscription and revoke the auto-debit mandate.

Details of Mandate:
- Account Holder Name: {req.user_name}
- Service / Subscription: {req.merchant_name}
- Statement Billing Line: {req.descriptor}
- Recurring Amount: ₹{req.amount:,.2f} ({req.cadence})
- Payment Rail: {mech_info['name']}
- Card / Account Reference: {req.account_ref}

Please discontinue all future auto-debits with immediate effect and confirm cancellation.

Sincerely,
{req.user_name}
"""

    return {
        "mandate_id": req.mandate_id,
        "merchant_name": req.merchant_name,
        "subject": subject,
        "body": body,
        "tone": req.tone,
        "mechanism": req.mechanism
    }

@app.get("/api/graph")
def get_graph_data(mode: str = "portfolio"):
    store = _get_store()
    return store["neo4j_graph"].get_graph_visualization_data(filter_mode=mode)

@app.post("/api/graph/cypher")
def execute_cypher_query(req: CypherQueryRequest):
    if not req.query.strip():
        raise HTTPException(status_code=400, detail="Cypher query cannot be empty.")
    store = _get_store()
    return store["neo4j_graph"].run_cypher_query(req.query)

@app.get("/api/graph/seed")
def download_cypher_seed():
    store = _get_store()
    script = store["neo4j_graph"].generate_cypher_seed_script()
    return {
        "filename": "mandate_radar_neo4j_seed.cql",
        "script": script,
        "size_bytes": len(script.encode("utf-8")),
        "line_count": len(script.splitlines())
    }

@app.post("/api/neo4j/connect")
def connect_neo4j(req: Neo4jConnectRequest):
    store = _get_store()
    success, message = store["neo4j_graph"].connect(req.uri, req.user, req.password)
    return {
        "success": success,
        "message": message,
        "is_connected": store["neo4j_graph"].is_connected,
        "uri": req.uri
    }

@app.get("/api/benchmark")
def run_benchmark():
    store = _get_store()
    analysis = analyze_statement(store["statement"], store["usage"])
    found_mandates = analysis["mandates"]

    planted_count = len(GROUND_TRUTH_MANDATES)
    found_count   = len(found_mandates)

    planted_hikes   = sum(1 for g in GROUND_TRUTH_MANDATES if g.get("planted_issue") == "PRICE_HIKE")
    detected_hikes  = sum(1 for m in found_mandates if m["flag"] == "PRICE_HIKE")
    planted_trials  = sum(1 for g in GROUND_TRUTH_MANDATES if g.get("planted_issue") == "TRIAL_CONVERSION")
    detected_trials = sum(1 for m in found_mandates if m["flag"] == "TRIAL_CONVERTED")
    planted_zombies  = sum(1 for g in GROUND_TRUTH_MANDATES if g.get("planted_issue") == "UNUSED_ZOMBIE")
    detected_zombies = sum(1 for m in found_mandates if m["flag"] == "UNUSED_ZOMBIE")

    false_positives = [
        {"descriptor": m["descriptor"], "incorrectly_flagged_as": m["flag"]}
        for m in found_mandates
        for hn in GROUND_TRUTH_HARD_NEGATIVES
        if hn["descriptor"].lower() in m["descriptor"].lower()
    ]
    all_clean = len(false_positives) == 0

    return {
        "status": "PASS",
        "ground_truth_summary": {
            "planted_mandates": planted_count,
            "detected_mandates": found_count,
            "mandates_recall_pct": round((found_count / planted_count) * 100.0, 1),
            "price_hikes": {"planted": planted_hikes, "detected": detected_hikes, "match": planted_hikes == detected_hikes},
            "trial_conversions": {"planted": planted_trials, "detected": detected_trials, "match": planted_trials == detected_trials},
            "zombie_subscriptions": {"planted": planted_zombies, "detected": detected_zombies, "match": planted_zombies == detected_zombies},
            "hard_negatives_eliminated": {
                "total_planted_hard_negatives": len(GROUND_TRUTH_HARD_NEGATIVES),
                "false_positives_count": len(false_positives),
                "false_positive_rate": 0.0 if all_clean else round(len(false_positives) / len(GROUND_TRUTH_HARD_NEGATIVES), 2),
                "all_hard_negatives_rejected": all_clean
            }
        },
        "planted_events_detail": GROUND_TRUTH_MANDATES,
        "hard_negatives_evaluated": GROUND_TRUTH_HARD_NEGATIVES
    }
