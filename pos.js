// ============================================================
// POS.JS — Punto de Venta de IMPRESSION Corporativo
// Versión: 3.0 — PIN corregido + Mensajes motivacionales
// ============================================================

// --- Configuración de Firebase ---
const firebaseConfig = {
    apiKey: "AIzaSyCpgNwZmq3rgC6ED9DZwWSRv9_DUxV3K-Y",
    authDomain: "impression-web-82c33.firebaseapp.com",
    projectId: "impression-web-82c33",
    storageBucket: "impression-web-82c33.firebasestorage.app",
    messagingSenderId: "622168477796",
    appId: "1:622168477796:web:2945f0a90ce92bdd4ecf71"
};

// Inicializar Firebase inmediatamente (los scripts ya cargaron antes que este archivo)
let db;
try {
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    db = firebase.firestore();
} catch (e) {
    console.error("Error inicializando Firebase en POS:", e);
    alert("Error de conexión con la base de datos. Recarga la página.");
}

// --- Mensajes motivacionales (cambian automáticamente cada semana) ---
const MENSAJES_MOTIVADORES = [
    "¡Hoy es un gran día para impresionar! 🎯",
    "Tu energía mueve el negocio. ¡A vender! 💪",
    "Cada cliente que atiendes es una oportunidad de brillar. ✨",
    "Sonríe, eres la primera cara de IMPRESSION. 😊",
    "Los grandes días empiezan con mucha actitud. 🚀",
    "¡Tu trabajo hace la diferencia! Que fluya la caja. 💰",
    "Atención y amabilidad son nuestros mejores productos. 🌟",
    "¡Esta semana va a ser increíble! Tú puedes con todo. 🏆",
    "La calidad empieza desde el mostrador. ¡Dale con todo! 🔥",
    "Eres parte del equipo más creativo de Saravena. 🎨",
    "Un cliente bien atendido siempre vuelve. ¡Tú lo sabes! 💡",
    "¡Buenos días, campeón/a! La caja te espera. ☀️"
];

function getMensajeSemanal() {
    // Calcula la semana del año para rotar los mensajes
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const weekNumber = Math.floor((now - startOfYear) / (7 * 24 * 60 * 60 * 1000));
    return MENSAJES_MOTIVADORES[weekNumber % MENSAJES_MOTIVADORES.length];
}

// --- Utilidades ---
function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return str.toString().replace(/[&<>'"]/g, tag => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[tag] || tag));
}

function fmt(num) {
    return Number(num || 0).toLocaleString('es-CO');
}

// --- Variables Globales ---
let loggedUser = null;
let allInventory = [];
let cart = [];
let lastSale = null;
let searchTimeout = null;
let isLoginInProgress = false;
let currentTab = 'todos';

// Protección contra fuerza bruta
let pinFailures = 0;
const MAX_PIN_FAILURES = 5;
let pinLockUntil = 0;

// --- Utilidad de elementos DOM ---
const getEl = (id) => document.getElementById(id);

// ============================================================
// 1. LÓGICA DE LOGIN CON PIN
// ============================================================
function showLoginError(msg) {
    const el = getEl('login-error');
    if (!el) return;
    el.innerText = msg;
    el.classList.remove('hidden');
    // Animación de error
    const panel = getEl('pin-panel');
    if (panel) {
        panel.classList.add('shake-error');
        setTimeout(() => panel.classList.remove('shake-error'), 500);
    }
}

async function loginPin(e) {
    if (e) e.preventDefault();
    if (isLoginInProgress) return;
    
    const pinInput = getEl('pin-display');
    const enteredPin = pinInput ? pinInput.value.trim() : "";

    if (enteredPin.length < 4) {
        showLoginError("El PIN debe tener mínimo 4 dígitos.");
        return;
    }

    // Verificar bloqueo
    if (Date.now() < pinLockUntil) {
        const secsLeft = Math.ceil((pinLockUntil - Date.now()) / 1000);
        showLoginError(`Demasiados intentos. Espera ${secsLeft}s.`);
        return;
    }

    isLoginInProgress = true;
    const loginBtn = getEl('btn-login-pin');
    if (loginBtn) loginBtn.innerHTML = '<span style="font-size:1rem">...</span>';

    try {
        const snapshot = await db.collection("pos_users")
            .where("pin", "==", enteredPin)
            .limit(1)
            .get();

        if (snapshot.empty) {
            pinFailures++;
            if (pinFailures >= MAX_PIN_FAILURES) {
                pinLockUntil = Date.now() + 60_000;
                pinFailures = 0;
                showLoginError("Demasiados intentos. Bloqueado por 60 segundos.");
            } else {
                showLoginError(`PIN incorrecto. (${pinFailures}/${MAX_PIN_FAILURES})`);
            }
            if (pinInput) pinInput.value = "";
        } else {
            // ✅ Login exitoso
            pinFailures = 0;
            pinLockUntil = 0;
            loggedUser = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };

            mostrarBienvenida(loggedUser.nombre);
        }
    } catch (error) {
        console.error("Error al verificar PIN:", error);
        showLoginError("Error de conexión. Verifica el internet.");
        if (pinInput) pinInput.value = "";
    } finally {
        isLoginInProgress = false;
        if (loginBtn) {
            loginBtn.innerHTML = '<i data-lucide="arrow-right" class="w-6 h-6"></i>';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    }
}

// ============================================================
// 2. PANTALLA DE BIENVENIDA
// ============================================================
function mostrarBienvenida(nombreCajero) {
    const overlay = getEl('welcome-overlay');
    const msgEl = getEl('welcome-message');
    const nameEl = getEl('welcome-name');

    if (overlay && msgEl && nameEl) {
        nameEl.innerText = `¡Hola, ${nombreCajero}! 👋`;
        msgEl.innerText = getMensajeSemanal();
        overlay.classList.remove('hidden');

        // Ocultar después de 3 segundos y entrar al POS
        setTimeout(() => {
            overlay.classList.add('hidden');
            entrarAlPOS();
        }, 3000);
    } else {
        // Si no hay overlay, entrar directo
        entrarAlPOS();
    }
}

function entrarAlPOS() {
    getEl('login-screen').classList.add('hidden');
    getEl('pos-screen').classList.remove('hidden');
    getEl('current-user-name').innerText = loggedUser.nombre;
    cargarInventario();
}

function logoutPos() {
    if (!confirm("¿Seguro deseas cerrar la caja?")) return;
    loggedUser = null;
    cart = [];
    lastSale = null;
    renderCartUI();
    getEl('login-screen').classList.remove('hidden');
    getEl('pos-screen').classList.add('hidden');
    const pinInput = getEl('pin-display');
    if (pinInput) pinInput.value = "";
}

// ============================================================
// 3. CARGAR INVENTARIO
// ============================================================
async function cargarInventario() {
    productsGrid().innerHTML = '<div class="col-span-full text-center py-20 text-gray-500">Cargando inventario...</div>';

    try {
        const [prodSnap, catSnap] = await Promise.all([
            db.collection("productos").get(),
            db.collection("catalogo").get()
        ]);

        allInventory = [];
        prodSnap.forEach(doc => allInventory.push({ id: doc.id, collection: 'productos', ...doc.data() }));
        catSnap.forEach(doc => allInventory.push({ id: doc.id, collection: 'catalogo', ...doc.data() }));

        // Eliminar duplicados por nombre exacto
        const seen = new Set();
        allInventory = allInventory.filter(item => {
            const key = (item.nombre || '').toLowerCase().trim();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        allInventory.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));
        filterAndRenderGrid();
    } catch (error) {
        console.error("Error cargando inventario:", error);
        productsGrid().innerHTML = '<div class="col-span-full text-center text-red-500 py-20">Error al cargar inventario.</div>';
    }
}

function filterAndRenderGrid() {
    const term = (getEl('search-input')?.value || '').trim().toLowerCase();
    
    // Categorías relajadas por sinónimos
    const mapConsumibles = ['consumible', 'consumibles', 'bebida', 'bebidas', 'snack', 'snacks', 'paquete', 'paquetes', 'comida', 'dulce', 'dulces'];
    const mapOficina = ['oficina', 'papeleria', 'papelería', 'artículo', 'articulo', 'cuaderno', 'lapiz', 'esfero', 'útil', 'utiles', 'útiles'];
    const mapServicios = ['servicio', 'servicios', 'impresion', 'impresión', 'impresiones', 'plotter', 'copia', 'copias', 'internet', 'cyber'];

    const isMatch = (catString, synonyms) => {
        if (!catString) return false;
        const str = catString.toLowerCase();
        return synonyms.some(syn => str.includes(syn));
    };

    let filtered = allInventory;

    // Filtro por Tab
    if (currentTab === 'consumibles') {
        filtered = filtered.filter(i => isMatch(i.categoria, mapConsumibles));
    } else if (currentTab === 'oficina') {
        filtered = filtered.filter(i => isMatch(i.categoria, mapOficina));
    } else if (currentTab === 'servicios') {
        filtered = filtered.filter(i => isMatch(i.categoria, mapServicios));
    }

    // Filtro por Búsqueda de Texto
    if (term) {
        filtered = filtered.filter(item =>
            (item.nombre || '').toLowerCase().includes(term) ||
            (item.categoria || '').toLowerCase().includes(term) ||
            (item.desc || '').toLowerCase().includes(term)
        );
    }

    renderGrid(filtered);
}

function productsGrid() { return getEl('products-grid'); }

function renderGrid(items) {
    const grid = productsGrid();
    if (!grid) return;

    if (items.length === 0) {
        grid.innerHTML = '<div class="col-span-full text-center py-20 text-gray-500">No se encontraron artículos.</div>';
        return;
    }

    const fragment = document.createDocumentFragment();

    items.forEach(item => {
        const sinStock = item.stock !== null && item.stock !== undefined && item.stock <= 0;
        const tieneStock = item.stock !== null && item.stock !== undefined;

        const card = document.createElement('div');
        card.className = `bg-gray-900 border border-gray-800 rounded-xl p-3 transition-all select-none flex flex-col relative ${
            sinStock ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-cyan-500 hover:-translate-y-1 active:scale-95'
        }`;

        if (!sinStock) {
            card.addEventListener('click', () => addToCart(item));
        }

        const mediaHTML = item.tipo_media === 'video'
            ? `<video src="${escapeHTML(item.imagen)}" class="w-full h-full object-cover" muted loop autoplay playsinline></video>`
            : item.imagen
                ? `<img src="${escapeHTML(item.imagen)}" class="w-full h-full object-cover" alt="${escapeHTML(item.nombre)}" loading="lazy">`
                : '<div class="w-full h-full flex items-center justify-center text-gray-600"><i data-lucide="image" class="w-8 h-8"></i></div>';

        const stockColor = item.stock > 10 ? 'text-cyan-400' : item.stock > 0 ? 'text-yellow-400' : 'text-red-500';
        const stockHTML = tieneStock ? `<span class="text-[10px] ${stockColor}">Stock: ${item.stock}</span>` : '';

        card.innerHTML = `
            <div class="aspect-square bg-gray-800 rounded-lg mb-2 overflow-hidden">${mediaHTML}</div>
            <div class="flex-1 flex flex-col justify-between">
                <div>
                    <span class="text-[10px] text-gray-500 uppercase font-bold tracking-wider">${escapeHTML(item.categoria || 'Varios')}</span>
                    <h4 class="font-bold text-xs text-white line-clamp-2 leading-tight mt-0.5 mb-1">${escapeHTML(item.nombre)}</h4>
                </div>
                <div class="flex justify-between items-center pt-1 border-t border-gray-800">
                    <span class="font-bold text-cyan-400 text-sm">$${fmt(item.precio)}</span>
                    ${stockHTML}
                </div>
            </div>
            ${sinStock ? '<div class="absolute inset-0 rounded-xl bg-black/40 flex items-center justify-center"><span class="bg-red-900 text-red-300 text-[10px] font-bold px-2 py-1 rounded">SIN STOCK</span></div>' : ''}
        `;
        fragment.appendChild(card);
    });

    grid.innerHTML = '';
    grid.appendChild(fragment);
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ============================================================
// 4. CARRITO
// ============================================================
function addToCart(item) {
    const existing = cart.find(c => c.id === item.id && c.collection === item.collection);
    if (existing) {
        existing.qty++;
    } else {
        cart.push({
            id: item.id,
            collection: item.collection,
            nombre: item.nombre,
            precio: Number(item.precio) || 0,
            qty: 1
        });
    }
    // Reflejo visual inmediato del stock
    const invItem = allInventory.find(i => i.id === item.id && i.collection === item.collection);
    if (invItem && invItem.stock !== null && invItem.stock !== undefined) {
        invItem.stock = Math.max(0, invItem.stock - 1);
    }
    renderCartUI();
}

function updateCartQty(index, delta) {
    if (!cart[index]) return;
    const cartItem = cart[index];

    if (delta < 0) {
        const invItem = allInventory.find(i => i.id === cartItem.id && i.collection === cartItem.collection);
        if (invItem && invItem.stock !== null && invItem.stock !== undefined) {
            invItem.stock += 1;
        }
    }

    cart[index].qty += delta;
    if (cart[index].qty <= 0) cart.splice(index, 1);
    renderCartUI();
}

function renderCartUI() {
    const container = getEl('cart-items');
    const subtotalEl = getEl('cart-subtotal');
    const totalEl = getEl('cart-total');
    const btnCheckout = getEl('btn-checkout');
    if (!container) return;

    if (cart.length === 0) {
        container.innerHTML = `
            <div class="h-full flex flex-col items-center justify-center text-gray-600 gap-3">
                <i data-lucide="shopping-bag" class="w-12 h-12 opacity-40"></i>
                <p class="text-sm">El ticket está vacío</p>
            </div>`;
        if (subtotalEl) subtotalEl.innerText = '$0';
        if (totalEl) totalEl.innerText = '$0';
        if (btnCheckout) btnCheckout.disabled = true;
        if (typeof lucide !== 'undefined') lucide.createIcons();
        return;
    }

    const fragment = document.createDocumentFragment();
    let total = 0;

    cart.forEach((item, index) => {
        const itemTotal = item.precio * item.qty;
        total += itemTotal;

        const row = document.createElement('div');
        row.className = "bg-gray-800 rounded-lg p-3 mb-2 flex justify-between items-center border border-gray-700/50 gap-2";
        row.innerHTML = `
            <div class="flex-1 min-w-0">
                <h5 class="text-sm font-bold text-white truncate">${escapeHTML(item.nombre)}</h5>
                <p class="text-xs text-gray-400">$${fmt(item.precio)} c/u</p>
            </div>
            <div class="flex items-center gap-2 shrink-0">
                <div class="flex items-center bg-gray-900 rounded-lg border border-gray-700">
                    <button class="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-400 transition-colors" data-index="${index}" data-delta="-1">
                        <i data-lucide="minus" class="w-3 h-3 pointer-events-none"></i>
                    </button>
                    <span class="w-6 text-center text-sm font-bold text-white">${item.qty}</span>
                    <button class="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-cyan-400 transition-colors" data-index="${index}" data-delta="1">
                        <i data-lucide="plus" class="w-3 h-3 pointer-events-none"></i>
                    </button>
                </div>
                <span class="w-20 text-right font-bold text-cyan-400 text-sm">$${fmt(itemTotal)}</span>
            </div>`;
        fragment.appendChild(row);
    });

    container.innerHTML = '';
    container.appendChild(fragment);

    container.querySelectorAll('button[data-delta]').forEach(btn => {
        btn.addEventListener('click', () => {
            updateCartQty(Number(btn.dataset.index), Number(btn.dataset.delta));
        });
    });

    if (subtotalEl) subtotalEl.innerText = '$' + fmt(total);
    if (totalEl) totalEl.innerText = '$' + fmt(total);
    if (btnCheckout) btnCheckout.disabled = false;
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ============================================================
// 5. ARTÍCULO MANUAL
// ============================================================
function openCustomItemModal() {
    getEl('modal-custom-item').classList.remove('hidden');
    setTimeout(() => { const d = getEl('custom-desc'); if (d) d.focus(); }, 100);
}

function closeCustomModal() {
    getEl('modal-custom-item').classList.add('hidden');
    const f = getEl('form-custom-item');
    if (f) f.reset();
}

// ============================================================
// 6. CHECKOUT
// ============================================================
async function processCheckout() {
    if (cart.length === 0 || !loggedUser) return;

    const btnCheckout = getEl('btn-checkout');
    if (btnCheckout) {
        btnCheckout.innerHTML = '<span class="text-base">Procesando...</span>';
        btnCheckout.disabled = true;
    }

    let total = 0;
    const articulosGuardar = cart.map(item => {
        const subtotal = item.precio * item.qty;
        total += subtotal;
        return { nombre: item.nombre, precio: item.precio, cantidad: item.qty, subtotal, coleccion: item.collection };
    });

    try {
        const batch = db.batch();
        const paymentSelector = getEl('payment-method');
        const metodo_pago = paymentSelector ? paymentSelector.value : 'Efectivo';

        const ventaRef = db.collection("ventas").doc();
        batch.set(ventaRef, {
            vendedor_nombre: loggedUser.nombre,
            total,
            metodo_pago: metodo_pago,
            articulos: articulosGuardar,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        for (const item of cart) {
            if (item.collection === 'manual') continue;
            const invItem = allInventory.find(i => i.id === item.id && i.collection === item.collection);
            if (invItem && invItem.stock !== null && invItem.stock !== undefined) {
                batch.update(db.collection(item.collection).doc(item.id), {
                    stock: firebase.firestore.FieldValue.increment(-item.qty)
                });
            }
        }

        await batch.commit();

        lastSale = { id: ventaRef.id, fecha: new Date(), vendedor: loggedUser.nombre, articulos: articulosGuardar, total, metodo_pago };

        const msg = getEl('receipt-total-msg');
        if (msg) msg.innerText = `Total cobrado: $${fmt(total)} COP en ${metodo_pago}`;
        getEl('modal-receipt').classList.remove('hidden');

        cart = [];
        renderCartUI();
    } catch (error) {
        console.error("Error al procesar venta:", error);
        alert("Error al cobrar: " + error.message);
    } finally {
        if (btnCheckout) {
            btnCheckout.innerHTML = '<i data-lucide="banknote" class="w-6 h-6"></i> COBRAR';
            btnCheckout.disabled = cart.length === 0;
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    }
}

function newSale() {
    getEl('modal-receipt').classList.add('hidden');
    lastSale = null;
    cargarInventario();
}

function printReceipt() {
    if (!lastSale) return;
    const ticketDiv = getEl('ticket-print');
    if (!ticketDiv) return;

    getEl('print-date').innerText = lastSale.fecha.toLocaleString('es-CO');
    getEl('print-cashier').innerText = `Cajero: ${escapeHTML(lastSale.vendedor)}`;
    getEl('print-total').innerText = `TOTAL: $${fmt(lastSale.total)}`;

    let itemsHTML = '';
    lastSale.articulos.forEach(art => {
        itemsHTML += `<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
            <span>${art.cantidad}x ${escapeHTML(art.nombre)}</span>
            <span>$${fmt(art.subtotal)}</span>
        </div>`;
    });
    getEl('print-items').innerHTML = itemsHTML;
    ticketDiv.classList.remove('hidden');
    window.print();
    ticketDiv.classList.add('hidden');
}

// ============================================================
// 7. INICIALIZACIÓN — Solo cuando el DOM esté listo
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    try {
        if (typeof lucide !== 'undefined') lucide.createIcons();

        // ── Formulario Login ──
        const loginForm = getEl('login-form-pin');
        if (loginForm) {
            loginForm.addEventListener('submit', loginPin);
        }

        // ── Pestañas (Tabs) ──
        const tabBtns = document.querySelectorAll('.tab-btn');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                // Actualizar estilos
                tabBtns.forEach(t => {
                    t.classList.remove('bg-cyan-600', 'text-white');
                    t.classList.add('bg-gray-800', 'text-gray-400');
                });
                btn.classList.remove('bg-gray-800', 'text-gray-400');
                btn.classList.add('bg-cyan-600', 'text-white');
                
                // Actualizar estado y renderizar
                currentTab = btn.dataset.tab;
                filterAndRenderGrid();
            });
        });

        // ── Búsqueda de productos con debounce ──
        const searchInput = getEl('search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    filterAndRenderGrid();
                }, 250);
            });
        }

        // ── Formulario de artículo manual ──
        const formCustom = getEl('form-custom-item');
        if (formCustom) {
            formCustom.addEventListener('submit', (e) => {
                e.preventDefault();
                const desc = getEl('custom-desc').value.trim();
                const price = Math.abs(Number(getEl('custom-price').value));
                if (!desc || price <= 0) return;
                cart.push({ id: `manual_${Date.now()}`, collection: 'manual', nombre: desc, precio: price, qty: 1 });
                renderCartUI();
                closeCustomModal();
            });
        }
    } catch (err) {
        console.error("Error en inicialización del POS:", err);
    }
});
