"""
Broker File Parser — 券商文件/截图 → 标准化持仓列表
支持: CSV, PDF, 本地 OCR (EasyOCR)
"""
import csv
import io
import os
import re
import json
import logging
import ssl
from typing import List, Dict, Optional

# Force bypass SSL verification for local model downloads (Fix for macOS cert issue)
ssl._create_default_https_context = ssl._create_unverified_context

logger = logging.getLogger(__name__)

# ─── 列名别名字典 (中英文, 各券商格式) ─────────────────────────────────────
SYMBOL_ALIASES = [
    'symbol', 'ticker', 'code', 'isin', 'stock code', 'security code',
    'instrument', 'financial instrument', 'stock symbol',
    '股票代码', '证券代码', '代码', '股票编号', '证券编号', '标的', 'コード', '銘柄コード',
]
SHARES_ALIASES = [
    'shares', 'quantity', 'qty', 'position', 'holdings', 'units', 'lots',
    'amount', 'balance', 'no. of shares', 'number of shares',
    '持仓数量', '数量', '持有数量', '股数', '持仓', '持股数', '保有数量',
]
COST_ALIASES = [
    'avg cost', 'avg_cost', 'average cost', 'cost price', 'cost basis',
    'avg price', 'average price', 'purchase price', 'price paid',
    'cost per share', 'unit cost', 'book cost',
    '成本价', '均价', '摊薄成本', '平均成本', '买入均价', '成本', '取得単価',
]
PRICE_ALIASES = [
    'price', 'current price', 'market price', 'last price', 'close',
    'latest price', 'last', 'mkt price',
    '现价', '最新价', '市价', '收盘价', '時価',
]
CURRENCY_ALIASES = [
    'currency', 'ccy', 'cur',
    '币种', '货币', '通貨',
]
NAME_ALIASES = [
    'name', 'stock name', 'security name', 'description', 'asset name',
    '股票名称', '证券名称', '名称', '股票简称', '銘柄名',
]


def _normalize(s: str) -> str:
    """Lowercase, strip, collapse spaces."""
    return re.sub(r'\s+', ' ', str(s).strip().lower())


def _find_column(headers: List[str], aliases: List[str]) -> Optional[int]:
    """Find the best matching column index from alias list."""
    norm_h = [_normalize(h) for h in headers]
    for alias in aliases:
        for i, h in enumerate(norm_h):
            if h == alias:
                return i
    # Fallback: partial match
    for alias in aliases:
        for i, h in enumerate(norm_h):
            if alias in h or h in alias:
                return i
    return None


def _parse_number(s: str) -> float:
    """Parse a numeric string that may contain commas, currency signs, or parentheses (negative)."""
    if not s:
        return 0.0
    s = str(s).strip()
    # Remove currency signs and common prefixes
    s = re.sub(r'[¥$€£₹₽₩]', '', s)
    # Handle parentheses as negative
    neg = False
    if s.startswith('(') and s.endswith(')'):
        neg = True
        s = s[1:-1]
    # Remove commas and spaces
    s = s.replace(',', '').replace(' ', '')
    try:
        val = float(s)
        return -val if neg else val
    except ValueError:
        return 0.0


def _guess_currency_from_symbol(symbol: str) -> str:
    """Heuristic currency guess from ticker format."""
    s = symbol.upper().strip()
    if '.HK' in s or (s.isdigit() and len(s) >= 4 and len(s) <= 5):
        return 'HKD'
    if '.T' in s or '.JP' in s:
        return 'JPY'
    if '.SS' in s or '.SZ' in s or '.SH' in s:
        return 'CNY'
    if '.L' in s:
        return 'GBP'
    if '.DE' in s or '.PA' in s:
        return 'EUR'
    return 'USD'


# ═══════════════════════════════════════════════════════════════════════════════
#  CSV Parser
# ═══════════════════════════════════════════════════════════════════════════════
def parse_csv(file_bytes: bytes) -> List[Dict]:
    """Parse a CSV file (various broker formats) into standardized positions."""
    # Try different encodings
    text = None
    for enc in ['utf-8-sig', 'utf-8', 'gbk', 'gb2312', 'latin-1', 'shift_jis']:
        try:
            text = file_bytes.decode(enc)
            break
        except (UnicodeDecodeError, LookupError):
            continue
    if not text:
        return []

    # IB Activity Statement special handling: find the "Open Positions" section
    if 'Interactive Brokers' in text or 'Statement,Header' in text:
        return _parse_ib_csv(text)

    # General CSV parsing
    # Try to detect delimiter
    sniffer = csv.Sniffer()
    try:
        dialect = sniffer.sniff(text[:4096])
        delimiter = dialect.delimiter
    except csv.Error:
        delimiter = ','

    reader = csv.reader(io.StringIO(text), delimiter=delimiter)
    rows = list(reader)
    if len(rows) < 2:
        return []

    # Find header row (the one with most matches)
    best_header_idx = 0
    best_score = 0
    all_aliases = SYMBOL_ALIASES + SHARES_ALIASES + COST_ALIASES + PRICE_ALIASES
    for i, row in enumerate(rows[:20]):  # Only check first 20 rows
        score = sum(1 for cell in row if _normalize(cell) in [_normalize(a) for a in all_aliases])
        if score > best_score:
            best_score = score
            best_header_idx = i

    headers = rows[best_header_idx]
    data_rows = rows[best_header_idx + 1:]

    sym_idx = _find_column(headers, SYMBOL_ALIASES)
    shares_idx = _find_column(headers, SHARES_ALIASES)
    cost_idx = _find_column(headers, COST_ALIASES)
    price_idx = _find_column(headers, PRICE_ALIASES)
    ccy_idx = _find_column(headers, CURRENCY_ALIASES)
    name_idx = _find_column(headers, NAME_ALIASES)

    if sym_idx is None:
        return []

    positions = []
    for row in data_rows:
        if len(row) <= sym_idx:
            continue
        symbol = row[sym_idx].strip()
        if not symbol or symbol.startswith('#') or _normalize(symbol) in ['total', '合计', 'subtotal']:
            continue

        shares = _parse_number(row[shares_idx]) if shares_idx is not None and shares_idx < len(row) else 0
        avg_cost = _parse_number(row[cost_idx]) if cost_idx is not None and cost_idx < len(row) else 0
        price = _parse_number(row[price_idx]) if price_idx is not None and price_idx < len(row) else 0
        currency = row[ccy_idx].strip().upper() if ccy_idx is not None and ccy_idx < len(row) else _guess_currency_from_symbol(symbol)
        name = row[name_idx].strip() if name_idx is not None and name_idx < len(row) else ''

        # If we have price but no cost, use price as cost
        if avg_cost <= 0 and price > 0:
            avg_cost = price

        if shares > 0 and avg_cost > 0:
            positions.append({
                'symbol': symbol,
                'name': name,
                'shares': shares,
                'avg_cost': round(avg_cost, 4),
                'currency': currency,
            })

    return positions


def _parse_ib_csv(text: str) -> List[Dict]:
    """Parse IB Activity Statement CSV format (section-based)."""
    positions = []
    in_positions = False
    headers = []

    for line in text.splitlines():
        parts = line.split(',')
        if len(parts) < 3:
            continue

        section = parts[0].strip().strip('"')
        row_type = parts[1].strip().strip('"')

        if section in ['Open Positions', 'Positions'] and row_type == 'Header':
            in_positions = True
            headers = [p.strip().strip('"') for p in parts]
            continue

        if in_positions:
            if row_type == 'Data':
                data = [p.strip().strip('"') for p in parts]
                sym_idx = _find_column(headers, SYMBOL_ALIASES + ['symbol'])
                qty_idx = _find_column(headers, SHARES_ALIASES + ['quantity'])
                cost_idx = _find_column(headers, COST_ALIASES + ['cost basis per share', 'cost price'])
                ccy_idx = _find_column(headers, CURRENCY_ALIASES + ['currency'])

                if sym_idx and qty_idx and sym_idx < len(data) and qty_idx < len(data):
                    symbol = data[sym_idx]
                    shares = abs(_parse_number(data[qty_idx]))
                    cost = _parse_number(data[cost_idx]) if cost_idx and cost_idx < len(data) else 0
                    ccy = data[ccy_idx].strip().upper() if ccy_idx and ccy_idx < len(data) else 'USD'

                    if shares > 0 and symbol:
                        positions.append({
                            'symbol': symbol,
                            'name': '',
                            'shares': shares,
                            'avg_cost': round(cost, 4),
                            'currency': ccy,
                        })
            elif section not in ['Open Positions', 'Positions']:
                in_positions = False

    return positions


# ═══════════════════════════════════════════════════════════════════════════════
#  PDF Parser
# ═══════════════════════════════════════════════════════════════════════════════
def parse_pdf(file_bytes: bytes) -> List[Dict]:
    """Parse a PDF brokerage statement into standardized positions."""
    try:
        import pdfplumber
    except ImportError:
        return []

    positions = []

    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            # Try with default settings first, then with text-based detection
            for settings in [
                {},
                {"vertical_strategy": "text", "horizontal_strategy": "text"},
                {"vertical_strategy": "lines", "horizontal_strategy": "text"},
            ]:
                tables = page.extract_tables(table_settings=settings)
                for table in tables:
                    if not table or len(table) < 2:
                        continue

                    headers = table[0]
                    if not headers:
                        continue

                    sym_idx = _find_column(headers, SYMBOL_ALIASES)
                    shares_idx = _find_column(headers, SHARES_ALIASES)
                    cost_idx = _find_column(headers, COST_ALIASES)
                    price_idx = _find_column(headers, PRICE_ALIASES)
                    ccy_idx = _find_column(headers, CURRENCY_ALIASES)
                    name_idx = _find_column(headers, NAME_ALIASES)

                    if sym_idx is None or shares_idx is None:
                        continue

                    for row in table[1:]:
                        if not row or len(row) <= max(sym_idx, shares_idx):
                            continue
                        symbol = str(row[sym_idx] or '').strip()
                        if not symbol or _normalize(symbol) in ['total', '合计', 'subtotal', '']:
                            continue

                        shares = _parse_number(str(row[shares_idx] or ''))
                        avg_cost = _parse_number(str(row[cost_idx] or '')) if cost_idx is not None and cost_idx < len(row) else 0
                        price = _parse_number(str(row[price_idx] or '')) if price_idx is not None and price_idx < len(row) else 0
                        currency = str(row[ccy_idx] or '').strip().upper() if ccy_idx is not None and ccy_idx < len(row) else _guess_currency_from_symbol(symbol)
                        name = str(row[name_idx] or '').strip() if name_idx is not None and name_idx < len(row) else ''

                        if avg_cost <= 0 and price > 0:
                            avg_cost = price

                        if shares > 0:
                            positions.append({
                                'symbol': symbol,
                                'name': name,
                                'shares': shares,
                                'avg_cost': round(avg_cost, 4) if avg_cost > 0 else 0,
                                'currency': currency,
                            })

                    # If we found positions from this table, stop trying other settings
                    if positions:
                        break
                if positions:
                    break

    return positions


# ═══════════════════════════════════════════════════════════════════════════════
#  Local OCR Parser (EasyOCR)
# ═══════════════════════════════════════════════════════════════════════════════
_easyocr_reader = None

def get_easyocr_reader():
    global _easyocr_reader
    if _easyocr_reader is None:
        try:
            import easyocr
            # Load English and Simplified Chinese by default
            _easyocr_reader = easyocr.Reader(['en', 'ch_sim'])
            logger.info("EasyOCR Reader initialized (en, ch_sim)")
        except Exception as e:
            logger.error(f"Failed to init EasyOCR: {e}")
            raise e
    return _easyocr_reader


def parse_image(file_bytes: bytes, filename: str) -> List[Dict]:
    """Parse a screenshot image using Local EasyOCR."""
    reader = get_easyocr_reader()
    
    # Run OCR
    results = reader.readtext(file_bytes)
    # results: [([[xmin, ymin], [xmax, ymin], [xmax, ymax], [xmin, ymax]], text, prob), ...]

    if not results:
        return []

    # 1. Group results into horizontal lines
    # Dynamic line grouping based on average char height
    avg_h = sum([r[0][2][1] - r[0][0][1] for r in results]) / len(results)
    line_threshold = avg_h * 0.5  
    
    lines = []
    # Sort results by Y-coordinate first
    results_sorted = sorted(results, key=lambda r: r[0][0][1])
    
    if results_sorted:
        current_line = [results_sorted[0]]
        for i in range(1, len(results_sorted)):
            prev_y = current_line[-1][0][0][1]
            curr_y = results_sorted[i][0][0][1]
            if abs(curr_y - prev_y) < line_threshold:
                current_line.append(results_sorted[i])
            else:
                lines.append(current_line)
                current_line = [results_sorted[i]]
        lines.append(current_line)

    # 2. Extract positions from lines
    positions = []
    
    # Patterns for symbols and numbers
    # Symbol: AAPL, 00700, 00700.HK, VOO etc.
    sym_pattern = re.compile(r'^([A-Z]{1,5}|[0-9]{4,6}(\.HK)?)$', re.IGNORECASE)
    # Price/Qty: numbers with possible commas, dots
    num_pattern = re.compile(r'^-?[0-9,.]+K?$')

    for line in lines:
        # Sort each line by X-coordinate
        line_sorted = sorted(line, key=lambda r: r[0][0][0])
        text_row = [r[1].strip() for r in line_sorted]
        
        # Heuristic: A row with a symbol and at least one number might be a holding
        symbol = None
        name = ""
        shares = 0.0
        cost = 0.0
        
        numbers_found = []
        for i, text in enumerate(text_row):
            # Try to find symbol
            if sym_pattern.match(text) and not symbol:
                symbol = text.upper()
                # If HK stock lacks .HK, add it
                if symbol.isdigit() and len(symbol) >= 4 and len(symbol) <= 5:
                    symbol += ".HK"
                continue
            
            # Try to find numbers
            if num_pattern.match(text):
                val = _parse_number(text)
                numbers_found.append(val)
                continue
            
            # Keep names (text that isn't symbol or number)
            if not symbol and len(text) > 1 and i < 2:
                name = text

        if symbol and numbers_found:
            # Most screenshots take the format: [Symbol, Name, Shares, MarketValue, Cost...]
            # Or [Symbol, Name, Shares, Cost, Price...]
            # We'll take the first number as shares and a second (if exists) as cost/price
            shares = numbers_found[0]
            if len(numbers_found) >= 2:
                # If there's a second number, it's often the price or cost
                cost = numbers_found[1] # Simple heuristic
            
            if shares > 0:
                positions.append({
                    'symbol': symbol,
                    'name': name,
                    'shares': shares,
                    'avg_cost': round(cost, 4) if cost > 0 else 0,
                    'currency': _guess_currency_from_symbol(symbol),
                })

    # Deduplicate by symbol (sum shares)
    merged = {}
    for p in positions:
        s = p['symbol']
        if s in merged:
            old = merged[s]
            new_shares = old['shares'] + p['shares']
            if new_shares > 0:
                # Weighted average cost
                avg_cost = ((old['shares'] * old['avg_cost']) + (p['shares'] * p['avg_cost'])) / new_shares
                merged[s]['shares'] = new_shares
                merged[s]['avg_cost'] = round(avg_cost, 4)
        else:
            merged[s] = p

    return list(merged.values())


# ═══════════════════════════════════════════════════════════════════════════════
#  Main Entry Point
# ═══════════════════════════════════════════════════════════════════════════════
IMAGE_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'}
PDF_EXTENSIONS = {'pdf'}
CSV_EXTENSIONS = {'csv', 'tsv', 'txt', 'xls'}


def parse(file_bytes: bytes, filename: str) -> Dict:
    """
    Universal parser entry point.
    Returns: {"positions": [...], "source": "csv"|"pdf"|"image", "count": N}
    """
    ext = filename.lower().rsplit('.', 1)[-1] if '.' in filename else ''
    logger.info(f"Parsing file: {filename} (ext={ext}, size={len(file_bytes)} bytes)")

    positions = []
    source = 'unknown'

    try:
        if ext in CSV_EXTENSIONS:
            positions = parse_csv(file_bytes)
            source = 'csv'
        elif ext in PDF_EXTENSIONS:
            positions = parse_pdf(file_bytes)
            source = 'pdf'
        elif ext in IMAGE_EXTENSIONS:
            positions = parse_image(file_bytes, filename)
            source = 'image'
        else:
            # Try CSV first (most common), then PDF
            positions = parse_csv(file_bytes)
            if positions:
                source = 'csv'
            else:
                positions = parse_pdf(file_bytes)
                source = 'pdf'
    except Exception as e:
        logger.error(f"Parse error: {e}")
        return {"positions": [], "source": source, "count": 0, "error": str(e)}

    logger.info(f"Parsed {len(positions)} positions from {source}")
    return {
        "positions": positions,
        "source": source,
        "count": len(positions),
    }
