from __future__ import annotations

from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, List, Optional, Union
import xml.etree.ElementTree as ET


def _to_text(el: Optional[ET.Element]) -> Optional[str]:
    if el is None or el.text is None:
        return None
    t = el.text.strip()
    return t if t != "" else None


def _d(val: Optional[str]) -> Optional[Decimal]:
    if val is None:
        return None
    try:
        return Decimal(val.replace(",", "."))
    except (InvalidOperation, AttributeError):
        return None


def _money_from_cents_str(v: Optional[str]) -> Optional[Decimal]:
    if v is None:
        return None
    try:
        return (Decimal(int(v)) / Decimal(100)).quantize(Decimal("0.01"))
    except Exception:
        return None


def _qty_from_thousand_str(v: Optional[str]) -> Optional[Decimal]:
    if v is None:
        return None
    try:
        return (Decimal(int(v)) / Decimal(1000)).normalize()
    except Exception:
        return None


def _strip_nbsp(s: Optional[str]) -> Optional[str]:
    if s is None:
        return None
    return s.replace("\xa0", " ").strip()


def _parse_ts_yyyymmddhhmmss(ts: Optional[str]) -> Optional[datetime]:
    if not ts:
        return None
    ts = ts.strip()
    if len(ts) == 14 and ts.isdigit():
        return datetime.strptime(ts, "%Y%m%d%H%M%S")
    return None


def _parse_check_date_time(orderdate: Optional[str], ordertime: Optional[str]) -> Optional[datetime]:
    if not orderdate or not ordertime:
        return None
    od = orderdate.strip()
    ot = ordertime.strip()
    if len(od) == 8 and len(ot) == 6 and od.isdigit() and ot.isdigit():
        return datetime.strptime(od + ot, "%d%m%Y%H%M%S")
    return None


def _root_tag_no_ns(tag: str) -> str:
    if tag.startswith("{") and "}" in tag:
        return tag.split("}", 1)[1]
    return tag


def parse_tax_xml(xml_text: Union[str, bytes]) -> Dict[str, Any]:
    if isinstance(xml_text, (bytes, bytearray)):
        try:
            xml_text = xml_text.decode("cp1251")
        except Exception:
            xml_text = xml_text.decode("utf-8", errors="replace")

    xml_text = xml_text.strip()
    root = ET.fromstring(xml_text)
    root_tag = _root_tag_no_ns(root.tag)

    if root_tag == "RQ":
        return _parse_rq(root, xml_text)
    if root_tag == "CHECK":
        return _parse_check(root, xml_text)

    return {
        "source_format": root_tag,
        "header": {},
        "datetime": None,
        "total_sum": None,
        "currency": "UAH",
        "items": [],
        "discounts": [],
        "payments": [],
        "taxes": [],
        "mac": None,
        "raw": {"xml": xml_text},
    }


def _parse_rq(root: ET.Element, raw_xml: str) -> Dict[str, Any]:
    dat = root.find("DAT")
    c = dat.find("C") if dat is not None else None

    header: Dict[str, Any] = {}
    if dat is not None:
        header.update(
            {
                "ndv": root.attrib.get("NDv"),
                "prv": root.attrib.get("PrV"),
                "rq_v": root.attrib.get("V"),
                "di": dat.attrib.get("DI"),
                "dt": dat.attrib.get("DT"),
                "fn": dat.attrib.get("FN"),
                "tn": dat.attrib.get("TN"),
                "zn": dat.attrib.get("ZN"),
                "dat_v": dat.attrib.get("V"),
            }
        )

    dt_obj: Optional[datetime] = None
    if dat is not None:
        dt_obj = _parse_ts_yyyymmddhhmmss(_to_text(dat.find("TS")))

    if dt_obj is None and c is not None:
        e = c.find("E")
        if e is not None:
            dt_obj = _parse_ts_yyyymmddhhmmss(e.attrib.get("TS"))

    items: List[Dict[str, Any]] = []
    if c is not None:
        for p in c.findall("P"):
            nm = _strip_nbsp(p.attrib.get("NM"))
            line_no = p.attrib.get("N")
            sm = _money_from_cents_str(p.attrib.get("SM"))
            prc = _money_from_cents_str(p.attrib.get("PRC"))
            qty = _qty_from_thousand_str(p.attrib.get("Q")) or Decimal("1")
            unit = p.attrib.get("AT_TM")

            if prc is None and sm is not None and qty != Decimal("0"):
                try:
                    prc = (sm / qty).quantize(Decimal("0.01"))
                except Exception:
                    prc = None

            items.append(
                {
                    "line_no": int(line_no) if line_no and line_no.isdigit() else line_no,
                    "code": p.attrib.get("C"),
                    "barcode": p.attrib.get("CD"),
                    "excise_code": p.attrib.get("CZD"),
                    "name": nm,
                    "unit": unit,
                    "qty": qty,
                    "price": prc,
                    "sum": sm,
                    "tax_code": p.attrib.get("TX"),
                }
            )

    discounts: List[Dict[str, Any]] = []
    if c is not None:
        for d in c.findall("D"):
            targets = []
            for ni in d.findall("NI"):
                v = ni.attrib.get("NI")
                if v is None:
                    continue
                targets.append(int(v) if v.isdigit() else v)

            tax_code = d.attrib.get("TX")
            if tax_code is None:
                tx_el = d.find("TX")
                if tx_el is not None:
                    tax_code = tx_el.attrib.get("TX")

            discounts.append(
                {
                    "line_no": int(d.attrib["N"]) if d.attrib.get("N", "").isdigit() else d.attrib.get("N"),
                    "sum": _money_from_cents_str(d.attrib.get("SM")),
                    "type": d.attrib.get("TY"),
                    "tr": d.attrib.get("TR"),
                    "tax_code": tax_code,
                    "targets": targets,
                }
            )

    payments: List[Dict[str, Any]] = []
    total_sum: Optional[Decimal] = None
    if c is not None:
        for m in c.findall("M"):
            sm = _money_from_cents_str(m.attrib.get("SM"))
            payments.append(
                {
                    "line_no": int(m.attrib["N"]) if m.attrib.get("N", "").isdigit() else m.attrib.get("N"),
                    "type_code": m.attrib.get("T"),
                    "name": m.attrib.get("NM"),
                    "ps": m.attrib.get("PSNM"),
                    "provider": m.attrib.get("PA"),
                    "terminal": m.attrib.get("PB"),
                    "rrn": m.attrib.get("RRN"),
                    "pan_mask": m.attrib.get("PD"),
                    "auth_code": m.attrib.get("PE"),
                    "comment": m.attrib.get("PC"),
                    "sum": sm,
                }
            )
            if total_sum is None and sm is not None:
                total_sum = sm

    taxes: List[Dict[str, Any]] = []
    if c is not None:
        e = c.find("E")
        if e is not None:
            tx_nodes = e.findall("TX")
            if tx_nodes:
                for tx in tx_nodes:
                    taxes.append(
                        {
                            "code": tx.attrib.get("TX"),
                            "name": tx.attrib.get("AT_NM") or tx.attrib.get("AT_NMD"),
                            "rate": _d(tx.attrib.get("TXPR")),
                            "sum": _money_from_cents_str(tx.attrib.get("TXSM")),
                            "allowance": tx.attrib.get("TXAL"),
                        }
                    )
            else:
                taxes.append(
                    {
                        "code": e.attrib.get("TX"),
                        "name": e.attrib.get("AT_NM"),
                        "rate": _d(e.attrib.get("TXPR")),
                        "sum": _money_from_cents_str(e.attrib.get("TXSM")),
                        "allowance": e.attrib.get("TXAL"),
                    }
                )

            e_sm = _money_from_cents_str(e.attrib.get("SM"))
            if e_sm is not None:
                total_sum = e_sm

    l_lines: List[str] = []
    if c is not None:
        for l in c.findall("L"):
            t = _to_text(l)
            if t:
                l_lines.append(_strip_nbsp(t))

    mac_el = root.find("MAC")
    mac: Optional[Dict[str, Any]] = None
    if mac_el is not None:
        mac = {
            "di": mac_el.attrib.get("DI"),
            "nt": mac_el.attrib.get("NT"),
            "value": _to_text(mac_el),
        }

    return {
        "source_format": "RQ",
        "header": header,
        "datetime": dt_obj,
        "total_sum": total_sum,
        "currency": "UAH",
        "items": items,
        "discounts": discounts,
        "payments": payments,
        "taxes": taxes,
        "mac": mac,
        "raw": {"l_lines": l_lines, "xml": raw_xml},
    }


def _parse_check(root: ET.Element, raw_xml: str) -> Dict[str, Any]:
    head = root.find("CHECKHEAD")
    total = root.find("CHECKTOTAL")
    pay = root.find("CHECKPAY")
    tax = root.find("CHECKTAX")
    body = root.find("CHECKBODY")

    header: Dict[str, Any] = {}
    if head is not None:
        header = {
            "uid": _to_text(head.find("UID")),
            "tin": _to_text(head.find("TIN")),
            "org_name": _to_text(head.find("ORGNM")),
            "point_name": _to_text(head.find("POINTNM")),
            "point_addr": _to_text(head.find("POINTADDR")),
            "order_date": _to_text(head.find("ORDERDATE")),
            "order_time": _to_text(head.find("ORDERTIME")),
            "order_num": _to_text(head.find("ORDERNUM")),
            "cashregister_num": _to_text(head.find("CASHREGISTERNUM")),
        }

    dt_obj = _parse_check_date_time(header.get("order_date"), header.get("order_time"))

    total_sum: Optional[Decimal] = None
    if total is not None:
        total_sum = _d(_to_text(total.find("SUM")))
        if total_sum is not None:
            total_sum = total_sum.quantize(Decimal("0.01"))

    items: List[Dict[str, Any]] = []
    if body is not None:
        for row in body.findall("ROW"):
            qty = _d(_to_text(row.find("AMOUNT")))
            price = _d(_to_text(row.find("PRICE")))
            cost = _d(_to_text(row.find("COST")))
            if qty is not None:
                qty = qty.normalize()
            if price is not None:
                price = price.quantize(Decimal("0.01"))
            if cost is not None:
                cost = cost.quantize(Decimal("0.01"))

            items.append(
                {
                    "line_no": int(row.attrib["ROWNUM"]) if row.attrib.get("ROWNUM", "").isdigit() else row.attrib.get("ROWNUM"),
                    "code": _to_text(row.find("CODE")),
                    "name": _strip_nbsp(_to_text(row.find("NAME"))),
                    "unit": _to_text(row.find("UNITNM")),
                    "qty": qty,
                    "price": price,
                    "sum": cost,
                    "tax_code": _to_text(row.find("LETTERS")),
                }
            )

    payments: List[Dict[str, Any]] = []
    if pay is not None:
        for row in pay.findall("ROW"):
            payments.append(
                {
                    "line_no": int(row.attrib["ROWNUM"]) if row.attrib.get("ROWNUM", "").isdigit() else row.attrib.get("ROWNUM"),
                    "type_code": _to_text(row.find("PAYFORMCD")),
                    "name": _to_text(row.find("PAYFORMNM")),
                    "sum": (_d(_to_text(row.find("SUM"))) or Decimal("0")).quantize(Decimal("0.01")),
                    "provided": (_d(_to_text(row.find("PROVIDED"))) or Decimal("0")).quantize(Decimal("0.01")),
                    "remains": (_d(_to_text(row.find("REMAINS"))) or Decimal("0")).quantize(Decimal("0.01")),
                }
            )

    taxes: List[Dict[str, Any]] = []
    if tax is not None:
        for row in tax.findall("ROW"):
            taxes.append(
                {
                    "code": _to_text(row.find("LETTER")),
                    "name": _to_text(row.find("NAME")),
                    "rate": _d(_to_text(row.find("PRC"))),
                    "sum": (_d(_to_text(row.find("SUM"))) or Decimal("0")).quantize(Decimal("0.01")),
                    "turnover": (_d(_to_text(row.find("TURNOVER"))) or Decimal("0")).quantize(Decimal("0.01")),
                }
            )

    return {
        "source_format": "CHECK",
        "header": header,
        "datetime": dt_obj,
        "total_sum": total_sum,
        "currency": "UAH",
        "items": items,
        "discounts": [],
        "payments": payments,
        "taxes": taxes,
        "mac": None,
        "raw": {"xml": raw_xml},
    }
