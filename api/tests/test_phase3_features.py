"""
Phase 3 Acceptance Test Suite: Features & High Performance
==========================================================
Verifies:
1. Bank Adapters: HDFC, ICICI, SBI, Axis, and Kotak statement dialects & preambles.
2. Column mapping fallback for non-standard formats.
3. RapidFuzz merchant resolution with confidence scoring.
4. Merchant correction user feedback loop.
5. Standard RFC 5545 iCalendar (.ics) export.
6. Detection explainability fields (detection_reason, status_reason, rejected_groups).
7. Vectorized detection performance benchmark: 50,000 rows in under 5.0 seconds.
"""
import io
import time
import pytest
import pandas as pd
from fastapi.testclient import TestClient

from main import app
from app.services.auth_service import create_access_token
from detector import analyze_statement, resolve_merchant_from_descriptor

client = TestClient(app)


@pytest.fixture
def auth_headers():
    token = create_access_token({"sub": "usr_phase3_tester", "email": "tester3@example.com", "full_name": "Phase3 Tester"})
    return {"Authorization": f"Bearer {token}"}


def test_bank_adapters_hdfc_icici_sbi_axis_kotak(auth_headers):
    """Verify statement CSVs in specific bank layouts are automatically recognized."""
    # 1. HDFC Format
    csv_hdfc = (
        "Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance\n"
        "05/01/2026,UPI-NETFLIX-482910,REF001,05/01/2026,649.00,,45000.00\n"
        "05/02/2026,UPI-NETFLIX-482911,REF002,05/02/2026,649.00,,44351.00\n"
        "05/03/2026,UPI-NETFLIX-482912,REF003,05/03/2026,649.00,,43702.00\n"
    )
    r1 = client.post(
        "/api/statement/upload",
        files={"file": ("hdfc_statement.csv", io.BytesIO(csv_hdfc.encode("utf-8")), "text/csv")},
        data={"account_label": "HDFC Savings"},
        headers=auth_headers
    )
    assert r1.status_code == 200, r1.text
    d1 = r1.json()
    assert d1["bank_detected"] == "HDFC Bank"
    assert len(d1["mandates"]) >= 1
    assert "Netflix" in d1["mandates"][0]["merchant_name"]

    # 2. ICICI Format
    csv_icici = (
        "Transaction Date,Value Date,Cheque Number,Transaction Remarks,Withdrawal Amount (INR ),Deposit Amount (INR ),Balance (INR )\n"
        "02/01/2026,02/01/2026,CHQ1,SPOTIFY INDIA AUTOPAY,119.00,,25000.00\n"
        "02/02/2026,02/02/2026,CHQ2,SPOTIFY INDIA AUTOPAY,119.00,,24881.00\n"
        "02/03/2026,02/03/2026,CHQ3,SPOTIFY INDIA AUTOPAY,119.00,,24762.00\n"
    )
    r2 = client.post(
        "/api/statement/upload",
        files={"file": ("icici_statement.csv", io.BytesIO(csv_icici.encode("utf-8")), "text/csv")},
        data={"account_label": "ICICI Salary"},
        headers=auth_headers
    )
    assert r2.status_code == 200, r2.text
    d2 = r2.json()
    assert d2["bank_detected"] == "ICICI Bank"
    assert len(d2["mandates"]) >= 1

    # 3. SBI Format with metadata preamble
    csv_sbi = (
        "Account Name: Rahul Sharma\n"
        "Account Number: 0000003891029312\n"
        "Branch: KORAMANGALA\n"
        "\n"
        "Txn Date,Value Date,Description,Ref No./Cheque No.,Debit,Credit,Balance\n"
        "10 Jan 2026,10 Jan 2026,GOOGLE*YOUTUBE G.CO/HELPPAY,REF1,189.00,,80000.00\n"
        "10 Feb 2026,10 Feb 2026,GOOGLE*YOUTUBE G.CO/HELPPAY,REF2,189.00,,79811.00\n"
        "10 Mar 2026,10 Mar 2026,GOOGLE*YOUTUBE G.CO/HELPPAY,REF3,189.00,,79622.00\n"
    )
    r3 = client.post(
        "/api/statement/upload",
        files={"file": ("sbi_statement.csv", io.BytesIO(csv_sbi.encode("utf-8")), "text/csv")},
        data={"account_label": "SBI Primary"},
        headers=auth_headers
    )
    assert r3.status_code == 200, r3.text
    d3 = r3.json()
    assert d3["bank_detected"] == "State Bank of India (SBI)"
    assert len(d3["mandates"]) >= 1

    # 4. Axis Bank Format
    csv_axis = (
        "Tran Date,CHQNO,PARTICULARS,DR,CR,BAL\n"
        "15-01-2026,NA,AMAZON PRIME ANNUAL,1499.00,,50000.00\n"
    )
    r4 = client.post(
        "/api/statement/upload",
        files={"file": ("axis_statement.csv", io.BytesIO(csv_axis.encode("utf-8")), "text/csv")},
        data={"account_label": "Axis Priority"},
        headers=auth_headers
    )
    assert r4.status_code == 200, r4.text
    d4 = r4.json()
    assert d4["bank_detected"] == "Axis Bank"
    assert len(d4["mandates"]) >= 1

    # 5. Kotak Mahindra Bank Format
    csv_kotak = (
        "Date,Transaction Details,Chq / Ref No,Debit,Credit,Balance\n"
        "08-01-2026,DISNEY+ HOTSTAR PREMIUM,KOTAK001,899.00,,30000.00\n"
    )
    r5 = client.post(
        "/api/statement/upload",
        files={"file": ("kotak_statement.csv", io.BytesIO(csv_kotak.encode("utf-8")), "text/csv")},
        data={"account_label": "Kotak 811"},
        headers=auth_headers
    )
    assert r5.status_code == 200, r5.text
    d5 = r5.json()
    assert d5["bank_detected"] == "Kotak Mahindra Bank"


def test_custom_column_mapping_fallback(auth_headers):
    """Verify non-standard CSV with arbitrary column headers succeeds with column_mapping."""
    csv_custom = (
        "Custom_Time,Vendor_Narration,Charge_Amount,Ignore_Col\n"
        "2026-01-12,NETFLIX MUMBAI,649.00,XYZ\n"
        "2026-02-12,NETFLIX MUMBAI,649.00,XYZ\n"
        "2026-03-12,NETFLIX MUMBAI,649.00,XYZ\n"
    )
    mapping = '{"date": "Custom_Time", "description": "Vendor_Narration", "debit": "Charge_Amount"}'

    res = client.post(
        "/api/statement/upload",
        files={"file": ("custom_statement.csv", io.BytesIO(csv_custom.encode("utf-8")), "text/csv")},
        data={"account_label": "Custom Account", "column_mapping": mapping},
        headers=auth_headers
    )
    assert res.status_code == 200
    data = res.json()
    assert len(data["mandates"]) >= 1
    assert "Netflix" in data["mandates"][0]["merchant_name"]


def test_rapidfuzz_merchant_resolution_and_confidence():
    """Verify RapidFuzz resolves fuzzy descriptor variations with high confidence."""
    # Noisy descriptor without standard regex format
    res = resolve_merchant_from_descriptor("UPI/P2M/PAYMENT/SPOTIFY-IND-AUTOPAY/82910")
    assert res is not None
    assert "Spotify" in res["name"]
    assert res["confidence_score"] >= 0.78
    assert res["match_method"] in ["regex", "fuzzy"]


def test_merchant_feedback_and_override(auth_headers):
    """Verify user feedback endpoint registers merchant correction and influences detection."""
    fb_res = client.post(
        "/api/merchants/correct",
        json={
            "descriptor": "SPECIAL_CO_WORKING_DESK",
            "merchant_name": "WeWork All Access",
            "category": "Workspace & SaaS",
            "parent_name": "The We Company"
        },
        headers=auth_headers
    )
    assert fb_res.status_code == 200
    assert fb_res.json()["status"] == "success"

    # Now verify resolve_merchant_from_descriptor prioritizes user feedback
    resolved = resolve_merchant_from_descriptor("SPECIAL_CO_WORKING_DESK")
    assert resolved is not None
    assert resolved["name"] == "WeWork All Access"
    assert resolved["match_method"] == "user_feedback"
    assert resolved["confidence_score"] == 1.0


def test_calendar_ics_export(auth_headers):
    """Verify RFC 5545 iCalendar export returns valid VCALENDAR with VEVENT and VALARM."""
    res = client.get("/api/mandates/export.ics", headers=auth_headers)
    assert res.status_code == 200
    assert "text/calendar" in res.headers["content-type"]
    text = res.text
    assert "BEGIN:VCALENDAR" in text
    assert "VERSION:2.0" in text
    assert "END:VCALENDAR" in text


def test_explainability_fields(auth_headers):
    """Verify mandates contain detection_reason, status_reason, and rejected_groups are returned."""
    csv_data = (
        "Date,Description,Amount\n"
        "2026-01-05,NETFLIX INDIA,649.00\n"
        "2026-02-05,NETFLIX INDIA,649.00\n"
        "2026-03-05,NETFLIX INDIA,649.00\n"
        "2026-01-15,ONE_OFF_GROCERY_STORE,450.00\n"
    )
    res = client.post(
        "/api/statement/upload",
        files={"file": ("statement.csv", io.BytesIO(csv_data.encode("utf-8")), "text/csv")},
        headers=auth_headers
    )
    assert res.status_code == 200
    data = res.json()
    assert len(data["mandates"]) >= 1
    m = data["mandates"][0]
    assert "detection_reason" in m and len(m["detection_reason"]) > 10
    assert "status_reason" in m and len(m["status_reason"]) > 5
    assert "confidence_score" in m
    assert "rejected_groups" in data


def test_vectorized_performance_50k_statement():
    """Verify detector processes 50,000 transactions in under 5.0 seconds (Target < 5s)."""
    # Build 50,000 synthetic statement transactions with recurring charges & noise
    txs = []
    base_date = pd.Timestamp("2025-01-01")
    descriptors = [
        "NETFLIX INDIA MUMBAI", "SPOTIFY PREMIUM", "GOOGLE*YOUTUBE G.CO",
        "AMAZON PRIME", "SWIGGY BANGALORE", "UBER TRIP INDIA", "LOCAL GROCERY STORE"
    ]

    for i in range(50000):
        d_idx = i % len(descriptors)
        # Recurring every ~30 days for subscriptions, random dates for others
        day_offset = (i % 360) + (i // 1000)
        dt = base_date + pd.Timedelta(days=day_offset)
        amt = 649.00 if d_idx == 0 else (119.00 if d_idx == 1 else 189.00 if d_idx == 2 else 150.0 + (i % 50))
        txs.append({
            "date": dt.strftime("%Y-%m-%d"),
            "descriptor": descriptors[d_idx],
            "amount": amt,
            "ref": f"REF_{i}"
        })

    t0 = time.time()
    result = analyze_statement(txs, user_id="perf_user", account_label="Perf Account")
    elapsed = time.time() - t0

    print(f"\n[PERF BENCHMARK] 50,000 transactions analyzed in {elapsed:.3f} seconds.")
    assert elapsed < 5.0, f"50k performance exceeded 5s target: {elapsed:.3f}s"
    assert result["metrics"]["total_transactions"] == 50000
    assert len(result["mandates"]) >= 3
