"""
Bank Statement Adapters for Mandate Radar.
Specialized dialect parsers for India's major retail banks:
HDFC Bank, ICICI Bank, State Bank of India (SBI), Axis Bank, and Kotak Mahindra Bank.
Includes pre-header preamble skipping, column normalization, and custom mapping fallbacks.
"""
import io
import re
from typing import Dict, List, Optional, Tuple, Any
import pandas as pd


# Known column signatures for Indian retail banks
BANK_PROFILES = {
    "HDFC": {
        "name": "HDFC Bank",
        "header_tokens": ["narration", "withdrawal amt", "deposit amt", "closing balance"],
        "date_cols": ["date", "txn date", "value dt", "transaction date"],
        "desc_cols": ["narration", "transaction details", "description"],
        "debit_cols": ["withdrawal amt.", "withdrawal amt", "withdrawal amount", "debit amount"],
        "credit_cols": ["deposit amt.", "deposit amt", "deposit amount", "credit amount"],
        "ref_cols": ["chq./ref.no.", "chq / ref no", "ref no", "reference no"],
    },
    "ICICI": {
        "name": "ICICI Bank",
        "header_tokens": ["transaction remarks", "withdrawal amount", "deposit amount", "balance"],
        "date_cols": ["transaction date", "value date", "date"],
        "desc_cols": ["transaction remarks", "remarks", "narration"],
        "debit_cols": ["withdrawal amount (inr )", "withdrawal amount (inr)", "withdrawal amount", "debit amount"],
        "credit_cols": ["deposit amount (inr )", "deposit amount (inr)", "deposit amount", "credit amount"],
        "ref_cols": ["cheque number", "chq no", "ref no", "transaction id"],
    },
    "SBI": {
        "name": "State Bank of India (SBI)",
        "header_tokens": ["txn date", "value date", "description", "ref no./cheque no."],
        "date_cols": ["txn date", "date", "transaction date"],
        "desc_cols": ["description", "narration", "particulars"],
        "debit_cols": ["debit", "withdrawal", "dr amount"],
        "credit_cols": ["credit", "deposit", "cr amount"],
        "ref_cols": ["ref no./cheque no.", "ref no", "cheque no."],
    },
    "AXIS": {
        "name": "Axis Bank",
        "header_tokens": ["particulars", "dr", "cr", "bal"],
        "date_cols": ["tran date", "date", "transaction date"],
        "desc_cols": ["particulars", "narration", "description"],
        "debit_cols": ["dr", "debit", "withdrawal"],
        "credit_cols": ["cr", "credit", "deposit"],
        "ref_cols": ["chqno", "chq no", "ref no"],
    },
    "KOTAK": {
        "name": "Kotak Mahindra Bank",
        "header_tokens": ["transaction details", "chq / ref no", "debit", "credit"],
        "date_cols": ["date", "txn date", "transaction date"],
        "desc_cols": ["transaction details", "narration", "description"],
        "debit_cols": ["debit", "withdrawal amount", "withdrawal"],
        "credit_cols": ["credit", "deposit amount", "deposit"],
        "ref_cols": ["chq / ref no", "ref no", "reference number"],
    }
}


def normalize_col_header(col: str) -> str:
    """Normalizes header string for comparison: lowercase, strip whitespace, remove extra symbols."""
    c = str(col).lower().strip()
    c = re.sub(r"[\s_]+", " ", c)
    return c


def detect_bank_from_headers(columns: List[str]) -> Tuple[Optional[str], Optional[Dict[str, Any]]]:
    """Identifies bank profile matching given headers."""
    norm_cols = [normalize_col_header(c) for c in columns]
    joined_cols = " | ".join(norm_cols)

    best_bank = None
    best_matches = 0

    for bank_code, profile in BANK_PROFILES.items():
        matches = sum(1 for tok in profile["header_tokens"] if tok in joined_cols)
        if matches >= 2 and matches > best_matches:
            best_matches = matches
            best_bank = bank_code

    if best_bank:
        return best_bank, BANK_PROFILES[best_bank]
    return None, None


def find_table_header_line(text: str) -> int:
    """
    Scans CSV text line by line to locate the real table header,
    skipping statement preamble / customer metadata lines (e.g. 'Account Number:', 'Name:').
    Returns 0-based line index of table header.
    """
    lines = text.splitlines()
    for idx, line in enumerate(lines[:30]): # Scan first 30 lines
        line_lower = line.lower()
        # Look for combinations of date + (narration | description | particulars | details | remarks)
        has_date = any(k in line_lower for k in ["date", "txn date", "tran date"])
        has_desc = any(k in line_lower for k in ["narration", "description", "particulars", "remarks", "details"])
        has_amt = any(k in line_lower for k in ["amount", "withdrawal", "debit", "dr", "deposit", "credit", "cr", "balance"])

        if (has_date and has_desc) or (has_date and has_amt):
            return idx
    return 0


def resolve_bank_columns(
    df: pd.DataFrame,
    custom_mapping: Optional[Dict[str, str]] = None
) -> Dict[str, Optional[str]]:
    """
    Maps DataFrame columns to standard roles:
    'date', 'description', 'debit', 'credit', 'ref', 'type'.
    Supports explicit custom mappings or bank profile detection with generic heuristics.
    """
    # 1. Custom mapping takes immediate precedence if valid
    if custom_mapping:
        mapped = {}
        for role, col_name in custom_mapping.items():
            if col_name in df.columns:
                mapped[role] = col_name
        if mapped.get("date") and mapped.get("description") and (mapped.get("debit") or mapped.get("amount")):
            if not mapped.get("debit") and mapped.get("amount"):
                mapped["debit"] = mapped["amount"]
            return mapped

    norm_map = {normalize_col_header(c): c for c in df.columns}
    bank_code, bank_profile = detect_bank_from_headers(list(df.columns))

    date_col = None
    desc_col = None
    debit_col = None
    credit_col = None
    ref_col = None

    # 2. Try bank profile match first
    if bank_profile:
        for dc in bank_profile["date_cols"]:
            if dc in norm_map:
                date_col = norm_map[dc]
                break
        for sc in bank_profile["desc_cols"]:
            if sc in norm_map:
                desc_col = norm_map[sc]
                break
        for dbc in bank_profile["debit_cols"]:
            if dbc in norm_map:
                debit_col = norm_map[dbc]
                break
        for crc in bank_profile["credit_cols"]:
            if crc in norm_map:
                credit_col = norm_map[crc]
                break
        for rc in bank_profile["ref_cols"]:
            if rc in norm_map:
                ref_col = norm_map[rc]
                break

    # 3. Fallback to generic banking synonyms
    if not date_col:
        for k in ["date", "txn date", "transaction date", "value date", "tran date", "timestamp", "time"]:
            for norm_k, raw_col in norm_map.items():
                if k == norm_k or norm_k.startswith(k):
                    date_col = raw_col
                    break
            if date_col:
                break

    if not desc_col:
        for k in ["narration", "description", "particulars", "remarks", "transaction details", "descriptor", "details"]:
            for norm_k, raw_col in norm_map.items():
                if k in norm_k:
                    desc_col = raw_col
                    break
            if desc_col:
                break

    if not debit_col:
        for k in ["withdrawal amt", "withdrawal amount", "debit amount", "debit", "withdrawal", "withdrawals", "dr"]:
            for norm_k, raw_col in norm_map.items():
                if raw_col in (desc_col, date_col):
                    continue
                if k == "dr":
                    if re.search(r"\bdr\b", norm_k):
                        debit_col = raw_col
                        break
                elif k in norm_k:
                    debit_col = raw_col
                    break
            if debit_col:
                break

    if not debit_col:
        for k in ["amount", "txn amount", "amount (inr)", "transaction amount"]:
            for norm_k, raw_col in norm_map.items():
                if raw_col in (desc_col, date_col):
                    continue
                if k in norm_k:
                    debit_col = raw_col
                    break
            if debit_col:
                break

    if not credit_col:
        for k in ["deposit amt", "deposit amount", "credit amount", "credit", "deposit", "cr"]:
            for norm_k, raw_col in norm_map.items():
                if raw_col in (desc_col, date_col, debit_col):
                    continue
                if k == "cr":
                    if re.search(r"\bcr\b", norm_k):
                        credit_col = raw_col
                        break
                elif k in norm_k:
                    credit_col = raw_col
                    break
            if credit_col:
                break

    if not ref_col:
        for k in ["chq", "ref", "utr", "cheque", "txn id", "id"]:
            for norm_k, raw_col in norm_map.items():
                if raw_col in (desc_col, date_col, debit_col, credit_col):
                    continue
                if k in norm_k:
                    ref_col = raw_col
                    break
            if ref_col:
                break

    # Type/Dr/Cr Indicator column
    type_col = None
    for k in ["type", "dr/cr", "cr/dr", "indicator", "txn type"]:
        for norm_k, raw_col in norm_map.items():
            if k in norm_k:
                type_col = raw_col
                break
        if type_col:
            break

    return {
        "date": date_col,
        "description": desc_col,
        "debit": debit_col,
        "credit": credit_col,
        "ref": ref_col,
        "type": type_col,
        "bank_detected": bank_profile["name"] if bank_profile else "Generic / Auto-Detected"
    }
