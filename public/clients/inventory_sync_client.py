"""Lovable Inventory Sync — Python client helper.

Features:
  - ``x-api-key`` auth
  - Auto-retry on HTTP 429 (respects ``Retry-After`` header)
  - Cursor pagination generator: ``for p in client.iter_products(): ...``

Usage:
    from inventory_sync_client import InventorySyncClient
    client = InventorySyncClient(
        base_url="https://<project>.supabase.co/functions/v1/inventory-sync",
        api_key=os.environ["LOVABLE_INVENTORY_KEY"],
    )
    client.ping()
    for product in client.iter_products(updated_since="2026-01-01T00:00:00Z"):
        print(product["id"], product["name"], product["stock"])
    client.update_stock(product_id, 25)
    client.update_price(product_id, price=1200, sale_price=999)
"""
from __future__ import annotations

import random
import time
from typing import Any, Iterator, Optional

import requests


class InventorySyncError(Exception):
    def __init__(self, status: int, body: Any):
        super().__init__(f"HTTP {status}: {body}")
        self.status = status
        self.body = body


class InventorySyncClient:
    def __init__(self, base_url: str, api_key: str, max_retries: int = 5, timeout: float = 30.0):
        if not base_url:
            raise ValueError("base_url required")
        if not api_key:
            raise ValueError("api_key required")
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.max_retries = max_retries
        self.timeout = timeout
        self._session = requests.Session()

    # ---- low-level ----
    def _request(self, method: str, path: str, *, params: Optional[dict] = None, json_body: Optional[dict] = None) -> Any:
        url = self.base_url + path
        headers = {"x-api-key": self.api_key}
        if json_body is not None:
            headers["Content-Type"] = "application/json"

        attempt = 0
        while True:
            res = self._session.request(
                method, url, params=params, json=json_body, headers=headers, timeout=self.timeout
            )
            if res.status_code == 429 and attempt < self.max_retries:
                retry_after = float(res.headers.get("retry-after", 1))
                wait = max(retry_after, (2 ** attempt) * 0.25 + random.random() * 0.2)
                time.sleep(wait)
                attempt += 1
                continue

            try:
                data = res.json() if res.text else None
            except ValueError:
                data = res.text
            if not res.ok:
                raise InventorySyncError(res.status_code, data)
            return data

    # ---- endpoints ----
    def ping(self) -> dict:
        return self._request("GET", "/ping")

    def list_products(self, *, page: Optional[int] = None, per_page: int = 50,
                      updated_since: Optional[str] = None, category: Optional[str] = None,
                      cursor: Optional[str] = None) -> dict:
        params = {"per_page": per_page}
        if page is not None:
            params["page"] = page
        if updated_since:
            params["updated_since"] = updated_since
        if category:
            params["category"] = category
        if cursor is not None:
            params["cursor"] = cursor
        return self._request("GET", "/products", params=params)

    def get_product(self, product_id: str) -> dict:
        return self._request("GET", f"/products/{product_id}")

    def update_stock(self, product_id: str, stock: int, variant: Optional[dict] = None) -> dict:
        body = {"stock": stock}
        if variant:
            body["variant"] = variant
        return self._request("POST", f"/products/{product_id}/stock", json_body=body)

    _UNSET = object()

    def update_price(self, product_id: str, *, price: Optional[float] = None,
                     sale_price: Any = _UNSET) -> dict:
        """Pass ``sale_price=None`` to clear it; omit to leave unchanged."""
        body: dict = {}
        if price is not None:
            body["price"] = price
        if sale_price is not self._UNSET:
            body["sale_price"] = sale_price
        return self._request("POST", f"/products/{product_id}/price", json_body=body)

    # ---- iterator ----
    def iter_products(self, *, updated_since: Optional[str] = None,
                      category: Optional[str] = None, per_page: int = 100) -> Iterator[dict]:
        """Yield every product, page-by-page, using cursor pagination."""
        cursor = ""  # empty cursor = first cursor-mode page
        while True:
            page = self.list_products(
                cursor=cursor, per_page=per_page,
                updated_since=updated_since, category=category,
            )
            for p in page.get("products", []):
                yield p
            pagination = page.get("pagination") or {}
            if not pagination.get("has_more") or not pagination.get("next_cursor"):
                return
            cursor = pagination["next_cursor"]
