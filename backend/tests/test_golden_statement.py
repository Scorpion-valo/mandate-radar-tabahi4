"""
Golden 24-Month Statement Regression Test
Tests end-to-end detection precision on high-volume real-world statement simulation (24 months, thousands of transactions).
Asserts:
1. 0 False Positives on discretionary shopping (Amazon retail, Swiggy, Zepto, Uber).
2. Amazon retail orders do NOT match Amazon Prime.
3. AWS Cloud is classified as usage_based.
4. Correct recovery of genuine recurring subscriptions (Netflix, Spotify, Prime, Hotstar, ChatGPT).
5. Signed amount parsing (- debits, + salary credits dropped).
"""

import pytest
import io
import pandas as pd
from datetime import date, timedelta
from fastapi.testclient import TestClient

from main import app
from app.services.auth_service import create_access_token
from app.core.db import init_db, get_db
from app.models.user import User

client = TestClient(app)

def get_auth_headers():
    init_db()
    session = next(get_db())
    u = session.query(User).filter(User.id == "golden_user").first()
    if not u:
        u = User(id="golden_user", email="golden@example.com", password_hash="hash", full_name="Golden User", is_active=True)
        session.add(u)
        session.commit()
    token = create_access_token({"sub": "golden_user", "email": "golden@example.com"})
    return {"Authorization": f"Bearer {token}"}

def generate_24_month_golden_csv() -> str:
    """Generates a realistic 24-month bank statement CSV with signed amounts, noise, and planted mandates."""
    rows = []
    
    # Generate 24 calendar months: Jan 2024 through Dec 2025
    for month_idx in range(24):
        # Determine year and month
        cur_year = 2024 + (month_idx // 12)
        cur_month = (month_idx % 12) + 1
        
        # 1. Salary Credit (Deposit: positive amount)
        rows.append({
            "Date": f"{cur_year}-{cur_month:02d}-01",
            "Description": "SALARY CREDIT TECH CORP PVT LTD",
            "Amount": 150000.00,
            "Reference": f"SAL{cur_year}{cur_month:02d}01"
        })
        
        # 2. Rent / EMI Obligation (Debit: negative)
        rows.append({
            "Date": f"{cur_year}-{cur_month:02d}-01",
            "Description": "HDFC BANK HOME LOAN EMI NACH DEBIT",
            "Amount": -25000.00,
            "Reference": f"EMI{cur_year}{cur_month:02d}01"
        })
        
        # 3. Netflix India (Monthly Debit: ₹649 on the 5th)
        rows.append({
            "Date": f"{cur_year}-{cur_month:02d}-05",
            "Description": "NETFLIX INDIA ENTERTAINMENT MUMBAI",
            "Amount": -649.00,
            "Reference": f"NFLX{cur_year}{cur_month:02d}"
        })
        
        # 4. Spotify Premium (Monthly Debit: ₹119 on the 12th)
        rows.append({
            "Date": f"{cur_year}-{cur_month:02d}-12",
            "Description": "SPOTIFY INDIA DIRECT DEBIT RECURRING",
            "Amount": -119.00,
            "Reference": f"SPOT{cur_year}{cur_month:02d}"
        })
        
        # 5. Amazon Prime Membership (Monthly Debit: ₹299 on the 18th)
        rows.append({
            "Date": f"{cur_year}-{cur_month:02d}-18",
            "Description": f"AMZN PRIME IN*{cur_year}{cur_month:02d}18 RECURRING",
            "Amount": -299.00,
            "Reference": f"PRIME{cur_year}{cur_month:02d}"
        })
        
        # 6. ChatGPT Plus Subscription (Monthly Debit: ₹1999 on the 22nd)
        rows.append({
            "Date": f"{cur_year}-{cur_month:02d}-22",
            "Description": "OPENAI *CHATGPT SUBSCRIPTION SAN FRANCISCO",
            "Amount": -1999.00,
            "Reference": f"GPT{cur_year}{cur_month:02d}"
        })
        
        # 7. AWS Cloud (Monthly Usage-based fluctuating: ~₹800 to ₹3500 on the 28th)
        aws_amt = round(850.0 + (month_idx * 115.0) % 2400, 2)
        rows.append({
            "Date": f"{cur_year}-{cur_month:02d}-28",
            "Description": "AMAZON WEB SERVICES AWS CLOUD BILLING",
            "Amount": -aws_amt,
            "Reference": f"AWS{cur_year}{cur_month:02d}"
        })
        
        # 8. Disney+ Hotstar Annual (Paid in March 2024 and March 2025: ₹899)
        if cur_month == 3:
            rows.append({
                "Date": f"{cur_year}-03-10",
                "Description": "DISNEY PLUS HOTSTAR ANNUAL SUBSCRIPTION NOVI DIGITAL",
                "Amount": -899.00,
                "Reference": f"HOTSTAR{cur_year}"
            })
            
        # 9. HEAVY NOISE - Amazon Retail Shopping (4-8 transactions per month, varying dates & amounts)
        retail_days = [2, 4, 8, 14, 19, 23, 27]
        retail_amts = [499.00, 1249.50, 340.00, 2899.00, 150.00, 699.00, 1820.00]
        for r_day, r_amt in zip(retail_days, retail_amts):
            rows.append({
                "Date": f"{cur_year}-{cur_month:02d}-{r_day:02d}",
                "Description": f"AMAZON.IN RETAIL ORDER {r_day * 10423} BANGALORE",
                "Amount": -r_amt,
                "Reference": f"AMZRET{cur_year}{cur_month:02d}{r_day}"
            })
            
        # 10. HEAVY NOISE - Swiggy & Zepto Orders (Rapid daily/weekly frequency)
        for d in range(3, 28, 4):
            rows.append({
                "Date": f"{cur_year}-{cur_month:02d}-{d:02d}",
                "Description": f"SWIGGY INSTAMART BLR ORDER #{d*771}",
                "Amount": -round(180.0 + (d * 12.5), 2),
                "Reference": f"SWG{d}"
            })
            rows.append({
                "Date": f"{cur_year}-{cur_month:02d}-{d+1:02d}",
                "Description": f"ZEPTO CONSUMER DELIVERY BLR #{d*883}",
                "Amount": -round(220.0 + (d * 8.0), 2),
                "Reference": f"ZPT{d}"
            })
            
        # 11. HEAVY NOISE - Uber Rides
        for d in range(1, 28, 6):
            rows.append({
                "Date": f"{cur_year}-{cur_month:02d}-{d:02d}",
                "Description": "UBER INDIA SYSTEMS PVT LTD TRIP",
                "Amount": -round(145.0 + (d * 15.0), 2),
                "Reference": f"UBR{d}"
            })
            
    df = pd.DataFrame(rows)
    # Sort chronologically
    df = df.sort_values("Date").reset_index(drop=True)
    return df.to_csv(index=False)

def test_golden_statement_zero_false_positives():
    csv_content = generate_24_month_golden_csv()
    csv_bytes = csv_content.encode("utf-8")
    headers = get_auth_headers()
    
    # Upload through the statement upload endpoint
    response = client.post(
        "/api/statement/upload",
        files={"file": ("golden_24_month_statement.csv", io.BytesIO(csv_bytes), "text/csv")},
        data={"account_label": "HDFC Primary Checking"},
        headers=headers
    )
    
    assert response.status_code == 200, f"Upload failed: {response.text}"
    data = response.json()
    
    mandates = data["mandates"]
    mandate_names = [m["merchant_name"] for m in mandates]
    mandate_ids = [m["merchant_id"] for m in mandates]
    
    # Assert total rows parsed is realistic (24 months * ~30 txns/mo > 600 transactions)
    assert data["rows_parsed"] >= 500
    assert data["parse_report"]["reasons"]["credits_dropped"] == 24 # All 24 salary credits properly dropped
    
    # --- ASSERTION 1: ZERO FALSE POSITIVES ON DISCRETIONARY SHOPPING ---
    # Amazon Retail, Swiggy, Zepto, and Uber MUST NOT be classified as mandates!
    assert not any("retail" in str(m.get("descriptor", "")).lower() for m in mandates), "False positive: Amazon retail detected as mandate!"
    assert not any("swiggy" in str(m.get("descriptor", "")).lower() for m in mandates), "False positive: Swiggy orders detected as mandate!"
    assert not any("zepto" in str(m.get("descriptor", "")).lower() for m in mandates), "False positive: Zepto orders detected as mandate!"
    assert not any("uber" in str(m.get("descriptor", "")).lower() for m in mandates), "False positive: Uber rides detected as mandate!"
    
    # --- ASSERTION 2: CORRECT RECALL OF GENUINE SUBSCRIPTIONS ---
    # Expected genuine merchants
    assert any("netflix" in mid for mid in mandate_ids), "Missing true positive: Netflix India"
    assert any("spotify" in mid for mid in mandate_ids), "Missing true positive: Spotify India"
    assert any("amazon_prime" in mid for mid in mandate_ids), "Missing true positive: Amazon Prime India"
    assert any("aws" in mid for mid in mandate_ids), "Missing true positive: AWS Cloud"
    assert any("chatgpt" in mid or "openai" in mid for mid in mandate_ids), "Missing true positive: ChatGPT / OpenAI"
    assert any("hotstar" in mid for mid in mandate_ids), "Missing true positive: Disney+ Hotstar Annual"
    
    # --- ASSERTION 3: USAGE-BASED CLASSIFICATION ---
    aws_m = next(m for m in mandates if "aws" in m["merchant_id"])
    assert aws_m["billing_type"] == "usage_based", "AWS must be tagged as usage_based billing"
    
    # --- ASSERTION 4: OBLIGATION SEGREGATION ---
    emi_m = next(m for m in mandates if "emi" in m["descriptor"].lower() or "hdfc" in m["merchant_name"].lower())
    assert emi_m.get("is_obligation") is True, "Home Loan EMI must be tagged as is_obligation=True"
    
    # --- ASSERTION 5: CANCELABLE SAVINGS MATH ---
    # Cancellable savings must strictly exclude loan EMI and usage_based AWS
    assert data["annual_committed_total"] > data["annual_potential_savings"]
    assert emi_m["annual_committed_cost"] not in [m.get("savings_if_cancelled") for m in mandates if m["flag"] != "HEALTHY"]
