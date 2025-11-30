/* script.js - Flipkart-like front-end handlers
   - client-only admin: localStorage (ic_products_local)
   - cart: localStorage ic_cart
   - orders: ic_orders
   - coupons: ic_active_coupon
*/
const STATIC_JSON = "./data/products.json";
const KEY_LOCAL_PRODUCTS = "ic_products_local";
const KEY_CART = "ic_cart";
const KEY_ORDERS = "ic_orders";
const KEY_ADMIN_SESSION = "ic_admin_logged_in";
const KEY_COUPON = "ic_active_coupon";
const DEMO_PASS = "admin123";

let products = [],
  cart = [];

/* helpers */
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const uid = (p = "id") =>
  `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const format = (v) => "₹" + Number(v || 0).toFixed(0);
const escapeHtml = (s) =>
  s
    ? String(s)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
    : "";

/* load products (static + local) */
async function loadProducts() {
  let staticP = [];
  try {
    const r = await fetch(STATIC_JSON, { cache: "no-cache" });
    if (r.ok) staticP = await r.json();
  } catch (e) {}
  let local = [];
  try {
    local = JSON.parse(localStorage.getItem(KEY_LOCAL_PRODUCTS) || "[]") || [];
  } catch (e) {
    local = [];
  }
  // normalize
  local = local.map((p) => ({
    id: p.id || uid("local"),
    title: p.title || "Untitled",
    category: p.category || "Uncategorized",
    price: Number(p.price || 0),
    description: p.description || p.desc || "",
    images: p.images || p.image ? [p.image] : [],
    image: (p.images && p.images[0]) || p.image || "images/placeholder.png",
    createdAt: p.createdAt || new Date().toISOString(),
  }));
  const seen = new Set(local.map((x) => x.id));
  const merged = [...local];
  (staticP || []).forEach((sp) => {
    if (!seen.has(sp.id))
      merged.push({
        id: sp.id || uid("s"),
        title: sp.title || "Untitled",
        category: sp.category || "Uncategorized",
        price: Number(sp.price || 0),
        description: sp.description || sp.desc || "",
        images: sp.images || sp.image ? [sp.image] : [],
        image:
          sp.image || (sp.images && sp.images[0]) || "images/placeholder.png",
        createdAt: sp.createdAt || new Date().toISOString(),
      });
  });
  products = merged;
  return products;
}

/* cart persistence */
function loadCart() {
  try {
    cart = JSON.parse(localStorage.getItem(KEY_CART) || "[]") || [];
  } catch (e) {
    cart = [];
  }
  return cart;
}
function saveCart() {
  localStorage.setItem(KEY_CART, JSON.stringify(cart));
  updateCartUI();
}
function addToCart(id, qty = 1) {
  const p = products.find((x) => x.id === id) || {};
  const ex = cart.find((i) => i.id === id);
  if (ex) ex.qty = Number(ex.qty || 0) + Number(qty);
  else
    cart.push({
      id,
      title: p.title || id,
      price: p.price || 0,
      qty: Number(qty),
      image: p.image || (p.images && p.images[0]) || "",
    });
  saveCart();
}
function removeFromCart(id) {
  cart = cart.filter((i) => i.id !== id);
  saveCart();
}
function setQty(id, qty) {
  const it = cart.find((i) => i.id === id);
  if (it) {
    it.qty = Math.max(1, Number(qty || 1));
    saveCart();
  }
}

/* header cart UI */
function updateCartUI() {
  loadCart();
  const el = $("#cart-count");
  if (el) el.textContent = cart.reduce((s, i) => s + (Number(i.qty) || 0), 0);
}
window.updateCartUI = updateCartUI;

/* expose for other pages */
window.IC = window.IC || {};
window.IC.getProducts = () => products;
window.IC.getCart = () => loadCart();
window.IC.addToCart = addToCart;
window.IC.removeFromCart = removeFromCart;
window.IC.setQty = setQty;
window.IC.updateCartUI = updateCartUI;

/* admin helpers */
async function adminAddProduct(
  title,
  category,
  price,
  description,
  imagesBase64
) {
  const newP = {
    id: uid("local"),
    title,
    category,
    price: Number(price || 0),
    description,
    images: imagesBase64 || [],
    image: (imagesBase64 && imagesBase64[0]) || "images/placeholder.png",
    createdAt: new Date().toISOString(),
  };
  const arr = JSON.parse(localStorage.getItem(KEY_LOCAL_PRODUCTS) || "[]");
  arr.unshift(newP);
  localStorage.setItem(KEY_LOCAL_PRODUCTS, JSON.stringify(arr, null, 2));
  await loadProducts();
  if (document.getElementById("products-grid")) renderProductsPage();
  return newP;
}
function adminDeleteProduct(id) {
  const arr =
    JSON.parse(localStorage.getItem(KEY_LOCAL_PRODUCTS) || "[]") || [];
  const filtered = arr.filter((x) => x.id !== id);
  localStorage.setItem(KEY_LOCAL_PRODUCTS, JSON.stringify(filtered, null, 2));
  loadProducts().then(() => {
    if (document.getElementById("products-grid")) renderProductsPage();
  });
}

/* simple coupon rules */
const COUPONS = {
  WELCOME50: { type: "percent", value: 50, maxDiscount: 250, minCart: 500 },
  FLAT100: { type: "flat", value: 100, minCart: 300 },
  FREESHIP: { type: "shipping", value: 1, minCart: 800 },
};
function getActiveCoupon() {
  try {
    return JSON.parse(localStorage.getItem(KEY_COUPON) || "null");
  } catch (e) {
    return null;
  }
}
function setActiveCoupon(c) {
  localStorage.setItem(KEY_COUPON, JSON.stringify(c));
}
function clearActiveCoupon() {
  localStorage.removeItem(KEY_COUPON);
}

/* totals */
function calcTotals(cartList, coupon) {
  const subtotal = (cartList || []).reduce(
    (s, i) => s + Number(i.price || 0) * Number(i.qty || 0),
    0
  );
  let discount = 0,
    delivery = subtotal >= 800 ? 0 : 49;
  if (coupon) {
    if (coupon.type === "percent")
      discount = Math.min(
        Math.round(subtotal * (coupon.value / 100)),
        coupon.maxDiscount || Infinity
      );
    else if (coupon.type === "flat") discount = coupon.value || 0;
    else if (coupon.type === "shipping") delivery = 0;
  }
  const taxable = Math.max(0, subtotal - discount);
  const tax = Math.round(taxable * 0.18);
  const total = Math.max(0, subtotal - discount + tax + delivery);
  return { subtotal, discount, delivery, tax, total };
}

/* renderers: index, products, product page, cart, checkout, admin listing */

/* HOME - render featured */
async function renderHome() {
  await loadProducts();
  // featured (first 8)
  const f = products.slice(0, 8);
  const wrap = $("#home-featured");
  if (!wrap) return;
  wrap.innerHTML = "";
  f.forEach((p) => {
    const el = document.createElement("div");
    el.className = "product-card";
    el.innerHTML = `<a href="product.html?id=${encodeURIComponent(
      p.id
    )}"><img src="${escapeHtml(p.image)}" alt=""></a>
      <div class="product-meta"><div class="title">${escapeHtml(
        p.title
      )}</div><div class="price">${format(
      p.price
    )}</div><div class="desc">${escapeHtml(p.description || "").slice(
      0,
      80
    )}</div></div>
      <div class="card-actions"><a class="btn primary" href="product.html?id=${encodeURIComponent(
        p.id
      )}">View</a><button class="btn ghost" data-add="${
      p.id
    }">Add</button></div>`;
    wrap.appendChild(el);
  });
  $$(".product-card [data-add]").forEach((b) =>
    b.addEventListener("click", (e) => {
      addToCart(e.currentTarget.dataset.add, 1);
      alert("Added to cart");
    })
  );
  updateCartUI();
}

/* PRODUCTS PAGE */
async function renderProductsPage() {
  await loadProducts();
  const grid = $("#products-grid");
  if (!grid) return;
  grid.innerHTML = "";
  const filter =
    (document.getElementById("cat-filter") &&
      document.getElementById("cat-filter").value) ||
    "All";
  const q = (
    (document.getElementById("search") &&
      document.getElementById("search").value) ||
    ""
  ).toLowerCase();
  const sort =
    (document.getElementById("sort") &&
      document.getElementById("sort").value) ||
    "relevance";
  let list = products.filter(
    (p) =>
      (filter === "All" || p.category === filter) &&
      (!q || (p.title + p.description).toLowerCase().includes(q))
  );
  if (sort === "price-asc") list.sort((a, b) => a.price - b.price);
  else if (sort === "price-desc") list.sort((a, b) => b.price - a.price);
  else if (sort === "newest")
    list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (!list.length) {
    document.getElementById("no-products") &&
      (document.getElementById("no-products").style.display = "block");
    grid.style.display = "none";
    return;
  } else {
    document.getElementById("no-products") &&
      (document.getElementById("no-products").style.display = "none");
    grid.style.display = "grid";
  }
  list.forEach((p) => {
    const el = document.createElement("div");
    el.className = "product-card";
    el.innerHTML = `<a class="thumb-link" href="product.html?id=${encodeURIComponent(
      p.id
    )}"><img src="${escapeHtml(p.image)}" alt=""></a>
      <div class="product-meta"><div class="title">${escapeHtml(
        p.title
      )}</div><div class="price">${format(
      p.price
    )}</div><div class="desc">${escapeHtml(p.description || "").slice(
      0,
      120
    )}</div></div>
      <div class="card-actions"><a class="btn primary" href="product.html?id=${encodeURIComponent(
        p.id
      )}">View</a><button class="btn ghost add-btn" data-id="${
      p.id
    }">Add</button></div>`;
    grid.appendChild(el);
  });
  $$(".add-btn").forEach((b) =>
    b.addEventListener("click", (e) => {
      addToCart(e.currentTarget.dataset.id, 1);
      alert("Added");
    })
  );
  // populate categories filter
  const catFilter = document.getElementById("cat-filter");
  if (catFilter) {
    catFilter.innerHTML = '<option value="All">All</option>';
    const cats = Array.from(
      new Set(products.map((p) => p.category || "Uncategorized"))
    ).sort();
    cats.forEach((c) => {
      const o = document.createElement("option");
      o.value = c;
      o.textContent = c;
      catFilter.appendChild(o);
    });
  }
  updateCartUI();
}

/* PRODUCT DETAIL - render by id param */
async function renderProductPage() {
  await loadProducts();
  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  const p = products.find((x) => String(x.id) === String(id));
  if (!p) {
    document.getElementById("product-area") &&
      (document.getElementById("product-area").style.display = "none");
    document.getElementById("not-found") &&
      (document.getElementById("not-found").style.display = "block");
    return;
  }
  $("#prod-title") && ($("#prod-title").textContent = p.title);
  $("#prod-price") && ($("#prod-price").textContent = format(p.price));
  $("#prod-desc") && ($("#prod-desc").textContent = p.description || "");
  $("#prod-category") && ($("#prod-category").textContent = p.category || "");
  $("#prod-sku") && ($("#prod-sku").textContent = "SKU: " + p.id);
  const main = $("#main-image");
  main &&
    (main.src =
      p.images && p.images.length
        ? p.images[0]
        : p.image || "images/placeholder.png");
  const thumbs = $("#thumbs");
  if (thumbs) {
    thumbs.innerHTML = "";
    (p.images && p.images.length
      ? p.images
      : [p.image || "images/placeholder.png"]
    ).forEach((src) => {
      const img = document.createElement("img");
      img.src = src;
      img.addEventListener("click", () => (main.src = src));
      thumbs.appendChild(img);
    });
  }
  $("#prod-add") &&
    ($("#prod-add").onclick = () => {
      addToCart(p.id, Number($("#prod-qty").value || 1));
      alert("Added to cart");
      if (window.IC && window.IC.updateCartUI) window.IC.updateCartUI();
    });
  $("#prod-buy") &&
    ($("#prod-buy").onclick = () => {
      addToCart(p.id, Number($("#prod-qty").value || 1));
      location.href = "checkout.html";
    });
  updateCartUI();
}

/* CART PAGE render */
function renderCartPage() {
  loadCart();
  const wrap = $("#cart-items");
  if (!wrap) return;
  wrap.innerHTML = "";
  if (!cart.length) {
    $("#cart-empty") && ($("#cart-empty").style.display = "block");
    return;
  } else {
    $("#cart-empty") && ($("#cart-empty").style.display = "none");
  }
  cart.forEach((item) => {
    const row = document.createElement("div");
    row.className = "cart-item";
    row.innerHTML = `<img src="${escapeHtml(
      item.image || "images/placeholder.png"
    )}" alt="">
      <div style="flex:1"><div style="font-weight:800">${escapeHtml(
        item.title
      )}</div><div class="small muted">${format(item.price)}</div>
      <div style="margin-top:8px"><button class="btn ghost qty-dec" data-id="${
        item.id
      }">-</button>
      <input class="qty-input" data-id="${
        item.id
      }" type="number" min="1" value="${
      item.qty
    }" style="width:64px;text-align:center;margin:0 6px;padding:6px;border-radius:6px;border:1px solid rgba(0,0,0,0.06);" />
      <button class="btn ghost qty-inc" data-id="${item.id}">+</button>
      <button class="btn" style="background:#fff1f0;color:#b91c1c;border:1px solid rgba(185,28,28,0.06);margin-left:12px" data-del="${
        item.id
      }">Remove</button></div></div>
      <div style="font-weight:800">${format(item.price * item.qty)}</div>`;
    wrap.appendChild(row);
  });
  $$(".qty-inc").forEach((b) =>
    b.addEventListener("click", (e) => {
      setQty(
        e.currentTarget.dataset.id,
        Number(
          (cart.find((i) => i.id === e.currentTarget.dataset.id) || {}).qty || 1
        ) + 1
      );
      renderCartPage();
    })
  );
  $$(".qty-dec").forEach((b) =>
    b.addEventListener("click", (e) => {
      const id = e.currentTarget.dataset.id;
      const it = cart.find((i) => i.id === id);
      if (it && it.qty > 1) {
        setQty(id, it.qty - 1);
        renderCartPage();
      }
    })
  );
  $$(".qty-input").forEach((inp) =>
    inp.addEventListener("change", (e) => {
      setQty(
        e.currentTarget.dataset.id,
        Math.max(1, Number(e.currentTarget.value || 1))
      );
      renderCartPage();
    })
  );
  $$(".btn[data-del]").forEach((b) =>
    b.addEventListener("click", (e) => {
      removeFromCart(e.currentTarget.dataset.del);
      renderCartPage();
    })
  );
  updateCartSummary();
  updateCartUI();
}

/* checkout page render (reads cart) */
function renderCheckoutPage() {
  loadCart();
  const wrap = $("#checkout-items");
  if (!wrap) return;
  wrap.innerHTML = "";
  if (!cart.length) {
    $("#checkout-empty") && ($("#checkout-empty").style.display = "block");
    return;
  } else {
    $("#checkout-empty") && ($("#checkout-empty").style.display = "none");
  }
  cart.forEach((item) => {
    const row = document.createElement("div");
    row.className = "cart-item";
    row.innerHTML = `<img src="${escapeHtml(
      item.image || "images/placeholder.png"
    )}" alt="">
      <div style="flex:1"><div style="font-weight:700">${escapeHtml(
        item.title
      )}</div><div class="muted">${format(item.price)}</div>
      <div style="margin-top:8px"><button class="btn ghost qty-dec" data-id="${
        item.id
      }">-</button>
      <input class="qty-input" data-id="${
        item.id
      }" type="number" min="1" value="${
      item.qty
    }" style="width:64px;text-align:center;margin:0 6px;padding:6px;border-radius:6px;border:1px solid rgba(0,0,0,0.06)" />
      <button class="btn ghost qty-inc" data-id="${
        item.id
      }">+</button></div></div>
      <div style="font-weight:800">${format(item.price * item.qty)}</div>`;
    wrap.appendChild(row);
  });
  // bind qty change
  $$(".qty-inc").forEach((b) =>
    b.addEventListener("click", (e) => {
      setQty(
        e.currentTarget.dataset.id,
        (cart.find((i) => i.id === e.currentTarget.dataset.id).qty || 0) + 1
      );
      renderCheckoutPage();
    })
  );
  $$(".qty-dec").forEach((b) =>
    b.addEventListener("click", (e) => {
      const id = e.currentTarget.dataset.id;
      const it = cart.find((i) => i.id === id);
      if (it && it.qty > 1) {
        setQty(id, it.qty - 1);
        renderCheckoutPage();
      }
    })
  );
  $$(".qty-input").forEach((inp) =>
    inp.addEventListener("change", (e) => {
      setQty(
        e.currentTarget.dataset.id,
        Math.max(1, Number(e.currentTarget.value || 1))
      );
      renderCheckoutPage();
    })
  );
  updateCheckoutSummary();
  updateCartUI();
}

/* update summary for cart page */
function updateCartSummary() {
  loadCart();
  const totals = calcTotals(cart, getActiveCoupon());
  $("#subtotal-val") &&
    ($("#subtotal-val").textContent = format(totals.subtotal));
  $("#discount-val") &&
    ($("#discount-val").textContent = "- " + format(totals.discount));
  $("#delivery-val") &&
    ($("#delivery-val").textContent = format(totals.delivery));
  $("#tax-val") && ($("#tax-val").textContent = format(totals.tax));
  $("#total-val") && ($("#total-val").textContent = format(totals.total));
}

/* update checkout summary */
function updateCheckoutSummary() {
  updateCartSummary();
}

/* admin page render list */
function renderAdminList() {
  const wrap = $("#product-list");
  if (!wrap) return;
  const arr =
    JSON.parse(localStorage.getItem(KEY_LOCAL_PRODUCTS) || "[]") || [];
  wrap.innerHTML = "";
  if (!arr.length) {
    wrap.innerHTML = '<div class="muted">No local products</div>';
    return;
  }
  arr.forEach((p) => {
    const row = document.createElement("div");
    row.className = "product-row";
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.style.alignItems = "center";
    row.style.padding = "10px 0";
    row.style.borderBottom = "1px solid rgba(0,0,0,0.04)";
    row.innerHTML = `<div style="display:flex;gap:10px;align-items:center"><img src="${escapeHtml(
      p.images && p.images[0]
        ? p.images[0]
        : p.image || "images/placeholder.png"
    )}" style="width:64px;height:64px;object-fit:cover;border-radius:8px"><div><strong>${escapeHtml(
      p.title
    )}</strong><div class="muted">${escapeHtml(p.category)} • ${format(
      p.price
    )}</div></div></div>
      <div><button class="btn ghost" data-edit="${
        p.id
      }">Edit</button> <button class="btn" data-del="${
      p.id
    }" style="background:#fff1f0;color:#b91c1c;border:1px solid rgba(185,28,28,0.06)">Delete</button></div>`;
    wrap.appendChild(row);
  });
  wrap.querySelectorAll("[data-del]").forEach((b) =>
    b.addEventListener("click", (e) => {
      if (confirm("Delete?")) {
        adminDeleteProduct(e.currentTarget.dataset.del);
        renderAdminList();
      }
    })
  );
  wrap
    .querySelectorAll("[data-edit]")
    .forEach((b) =>
      b.addEventListener("click", () =>
        alert("Edit not implemented in demo — delete & re-add to edit")
      )
    );
}

/* initialization for pages based on body id or element presence */
document.addEventListener("DOMContentLoaded", async () => {
  loadCart();
  await loadProducts();
  updateCartUI();
  if (document.getElementById("home-featured")) renderHome();
  if (document.getElementById("products-grid")) renderProductsPage();
  if (document.getElementById("product-area")) renderProductPage();
  if (document.getElementById("cart-items")) renderCartPage();
  if (document.getElementById("checkout-items")) renderCheckoutPage();
  if (document.getElementById("product-list")) renderAdminList();

  // admin add form
  const addBtn = $("#add-product");
  if (addBtn) {
    addBtn.addEventListener("click", async () => {
      addBtn.disabled = true;
      addBtn.textContent = "Adding...";
      const title = $("#p-title").value.trim();
      const category = $("#p-category").value.trim();
      const price = Number($("#p-price").value || 0);
      const desc = $("#p-desc").value.trim();
      const files = Array.from($("#p-images").files || []);
      if (!title || !files.length) {
        alert("Title & images required");
        addBtn.disabled = false;
        addBtn.textContent = "Add Product";
        return;
      }
      const images = [];
      for (const f of files) {
        images.push(await fileToBase64(f));
      }
      await adminAddProduct(title, category, price, desc, images);
      addBtn.disabled = false;
      addBtn.textContent = "Add Product";
      $("#product-form").reset();
      $("#thumbs") && ($("#thumbs").innerHTML = "");
      renderAdminList();
    });
    // preview images
    $("#p-images").addEventListener("change", async (e) => {
      const files = Array.from(e.target.files || []);
      const thumbs = $("#thumbs");
      thumbs.innerHTML = "";
      for (const f of files.slice(0, 8)) {
        const b = await fileToBase64(f);
        const img = document.createElement("img");
        img.src = b;
        img.style.width = "80px";
        img.style.height = "80px";
        img.style.objectFit = "cover";
        img.style.borderRadius = "8px";
        thumbs.appendChild(img);
      }
    });
  }

  // login form on admin-login.html
  const loginBtn = $("#login-btn");
  if (loginBtn) {
    loginBtn.addEventListener("click", () => {
      const user = $("#admin-user").value.trim();
      const pass = $("#admin-pass").value.trim();
      if (!user || !pass) {
        $("#login-feedback").textContent = "enter username + password";
        $("#login-feedback").style.color = "#b91c1c";
        return;
      }
      if (pass === DEMO_PASS) {
        localStorage.setItem(KEY_ADMIN_SESSION, "1");
        window.location.href = "admin-login.html";
      } else {
        $("#login-feedback").textContent = "invalid";
        $("#login-feedback").style.color = "#b91c1c";
        $("#admin-pass").value = "";
      }
    });
  }

  // header admin button (if present)
  const adminBtn = $("#admin-btn");
  if (adminBtn)
    adminBtn.addEventListener("click", () => {
      window.location.href =
        localStorage.getItem(KEY_ADMIN_SESSION) === "1"
          ? "admin-login.html"
          : "admin-login.html";
    });

  // logout on admin page
  const logoutBtn = $("#logout-btn");
  if (logoutBtn)
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem(KEY_ADMIN_SESSION);
      window.location.href = "admin-login.html";
    });

  // cart button header
  const cartBtn = $("#cart-btn");
  if (cartBtn)
    cartBtn.addEventListener(
      "click",
      () => (window.location.href = "cart.html")
    );

  // coupon apply on checkout
  const applyBtn = $("#apply-coupon");
  if (applyBtn)
    applyBtn.addEventListener("click", () => {
      const code = (($("#coupon-code") && $("#coupon-code").value) || "")
        .trim()
        .toUpperCase();
      if (!code) {
        alert("enter coupon");
        return;
      }
      const c = COUPONS[code];
      if (!c) {
        alert("invalid coupon");
        return;
      }
      const totals = calcTotals(cart || [], c);
      if (c.minCart && totals.subtotal < c.minCart) {
        alert("min cart " + c.minCart);
        return;
      }
      setActiveCoupon({ code, ...c });
      alert("coupon applied");
      if (document.getElementById("coupon-feedback"))
        document.getElementById("coupon-feedback").textContent =
          "Applied " + code;
      renderCheckoutPage();
    });

  // place order (demo)
  const placeBtn = $("#place-order");
  if (placeBtn)
    placeBtn.addEventListener("click", () => {
      const c = loadCart();
      if (!c.length) {
        alert("cart empty");
        return;
      }
      const addrName = $("#addr-name") && $("#addr-name").value.trim();
      const addrPhone = $("#addr-phone") && $("#addr-phone").value.trim();
      if (!addrName || !addrPhone) {
        alert("fill address");
        return;
      }
      const order = {
        id: "IC" + Date.now().toString().slice(-6),
        createdAt: new Date().toISOString(),
        items: c,
        totals: calcTotals(c, getActiveCoupon()),
        address: { name: addrName, phone: addrPhone },
      };
      const arr = JSON.parse(localStorage.getItem(KEY_ORDERS) || "[]") || [];
      arr.unshift(order);
      localStorage.setItem(KEY_ORDERS, JSON.stringify(arr, null, 2));
      localStorage.removeItem(KEY_CART);
      clearActiveCoupon();
      updateCartUI();
      alert("order placed " + order.id);
      window.location.href = "index.html";
    });

  // storage listener to update UI across tabs
  window.addEventListener("storage", (e) => {
    if (e.key === KEY_CART) updateCartUI();
    if (e.key === KEY_LOCAL_PRODUCTS)
      loadProducts().then(() => {
        if (document.getElementById("products-grid")) renderProductsPage();
        if (document.getElementById("home-featured")) renderHome();
        if (document.getElementById("product-list")) renderAdminList();
      });
  });
});

/* util: convert file to base64 */
function fileToBase64(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
}
