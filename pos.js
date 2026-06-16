// ============================================================
// POS.JS — Punto de Venta de IMPRESSION Corporativo
// Versión: 2.0 — Optimizado y con correcciones de seguridad
// ============================================================

// Configuración de Firebase
const firebaseConfig = {
    apiKey: "AIzaSyCpgNwZmq3rgC6ED9DZwWSRv9_DUxV3K-Y",
    authDomain: "impression-web-82c33.firebaseapp.com",
    projectId: "impression-web-82c33",
    storageBucket: "impression-web-82c33.firebasestorage.app",
    messagingSenderId: "622168477796",
    appId: "1:622168477796:web:2945f0a90ce92bdd4ecf71"
};

// Esperar a que Firebase esté disponible antes de inicializar
window.addEventListener('load', () => {
    firebase.initializeApp(firebaseConfig);
    window._db = firebase.firestore();
    lucide.createIcons();
});

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

function getDB() {
    if (!window._db) throw new Error("Firebase no inicializado aún.");
    return window._db;
}

// --- Variables Globales ---
let currentPin = "";
let loggedUser = null;
let allInventory = [];
let cart = [];
let lastSale = null;

// Límite de intentos fallidos de PIN para proteger fuerza bruta
let pinFailures = 0;
const MAX_PIN_FAILURES = 5;
let pinLockUntil = 0;

// --- Elementos UI (obtenidos después del DOM) ---
const getEl = (id) => document.getElementById(id);

// --- 1. LÓGICA DE LOGIN CON PIN ---
function addPin(num) {
    if (Date.now() < pinLockUntil) return; // Bloqueado
    if (currentPin.length < 6) {
        currentPin += num;
        updatePinDisplay();
        // Auto-login si llega a 6 dígitos
        if (currentPin.length === 6) loginPin();
    }
}

function clearPin() {
    currentPin = "";
    updatePinDisplay();
    if (getEl('login-error')) getEl('login-error').classList.add('hidden');
}

function updatePinDisplay() {
    const el = getEl('pin-display');
    if (el) el.value = '•'.repeat(currentPin.length);
}

async function loginPin() {
    const now = Date.now();

    // Verificar bloqueo por intentos fallidos
    if (now < pinLockUntil) {
        const secsLeft = Math.ceil((pinLockUntil - now) / 1000);
        showLoginError(`Demasiados intentos. Espera ${secsLeft} segundos.`);
        return;
    }

    if (currentPin.length < 4) {
        showLoginError("El PIN debe tener al menos 4 dígitos.");
        return;
    }

    const loginBtn = getEl('btn-login-pin');
    if (loginBtn) loginBtn.innerHTML = '<span class="text-sm">...</span>';

    try {
        const db = getDB();
        // SEGURIDAD: Solo comparar PIN, no descargar todos los usuarios
        const querySnapshot = await db.collection("pos_users")
            .where("pin", "==", currentPin)
            .limit(1)
            .get();

        if (querySnapshot.empty) {
            pinFailures++;
            if (pinFailures >= MAX_PIN_FAILURES) {
                pinLockUntil = Date.now() + 60_000; // Bloqueo 60 segundos
                pinFailures = 0;
                showLoginError("Demasiados intentos fallidos. Espera 60 segundos.");
            } else {
                showLoginError(`PIN incorrecto. Intento ${pinFailures}/${MAX_PIN_FAILURES}.`);
            }
            clearPin();
        } else {
            // Login exitoso: resetear contadores
            pinFailures = 0;
            pinLockUntil = 0;

            loggedUser = { id: querySnapshot.docs[0].id, ...querySnapshot.docs[0].data() };
            getEl('current-user-name').innerText = loggedUser.nombre;

            getEl('login-screen').classList.add('opacity-0');
            setTimeout(() => {
                getEl('login-screen').classList.add('hidden');
                getEl('pos-screen').classList.remove('hidden');
            }, 300);

            cargarInventario();
        }
    } catch (error) {
        console.error("Error al iniciar sesión:", error);
        showLoginError("Error de conexión. Verifica tu internet.");
    } finally {
        if (loginBtn) {
            loginBtn.innerHTML = '<i data-lucide="arrow-right" class="w-6 h-6"></i>';
            lucide.createIcons();
        }
    }
}

function showLoginError(msg) {
    const el = getEl('login-error');
    if (!el) return;
    el.innerText = msg;
    el.classList.remove('hidden');
}

function logoutPos() {
    if (!confirm("¿Seguro deseas cerrar la caja?")) return;
    loggedUser = null;
    cart = [];
    lastSale = null;
    renderCartUI();
    getEl('login-screen').classList.remove('hidden', 'opacity-0');
    getEl('pos-screen').classList.add('hidden');
    clearPin();
}

// --- 2. CARGAR INVENTARIO ---
async function cargarInventario() {
    productsGrid().innerHTML = '<div class="col-span-full text-center py-20 text-gray-500">Cargando inventario...</div>';

    try {
        const db = getDB();
        const [prodSnap, catSnap] = await Promise.all([
            db.collection("productos").get(),
            db.collection("catalogo").get()
        ]);

        allInventory = [];

        prodSnap.forEach(doc => allInventory.push({ id: doc.id, collection: 'productos', ...doc.data() }));
        catSnap.forEach(doc => allInventory.push({ id: doc.id, collection: 'catalogo', ...doc.data() }));

        // Eliminar duplicados por nombre (si el mismo artículo está en ambas colecciones)
        const seen = new Set();
        allInventory = allInventory.filter(item => {
            const key = (item.nombre || '').toLowerCase().trim();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        // Ordenar alfabéticamente
        allInventory.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));

        renderGrid(allInventory);
    } catch (error) {
        console.error("Error cargando inventario:", error);
        productsGrid().innerHTML = '<div class="col-span-full text-center text-red-500 py-20">Error al cargar. Verifica tu conexión.</div>';
    }
}

function productsGrid() { return getEl('products-grid'); }

function renderGrid(items) {
    const grid = productsGrid();
    if (items.length === 0) {
        grid.innerHTML = '<div class="col-span-full text-center py-20 text-gray-500">No se encontraron artículos.</div>';
        return;
    }

    // Usar DocumentFragment para mejor rendimiento (no repintar DOM por cada item)
    const fragment = document.createDocumentFragment();

    items.forEach(item => {
        const sinStock = item.stock !== null && item.stock !== undefined && item.stock <= 0;
        const tieneStock = item.stock !== null && item.stock !== undefined;

        const card = document.createElement('div');
        card.className = `bg-gray-900 border border-gray-800 rounded-xl p-4 transition-all select-none flex flex-col h-full ${
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

        const stockHTML = tieneStock
            ? `<span class="text-xs ${item.stock > 5 ? 'text-cyan-400' : item.stock > 0 ? 'text-yellow-400' : 'text-red-500'}">Stock: ${item.stock}</span>`
            : '';

        card.innerHTML = `
            <div class="aspect-square bg-gray-800 rounded-lg mb-3 overflow-hidden">${mediaHTML}</div>
            <div class="flex-1 flex flex-col justify-between">
                <div>
                    <span class="text-[10px] text-gray-500 uppercase font-bold tracking-wider">${escapeHTML(item.categoria || 'Varios')}</span>
                    <h4 class="font-bold text-sm text-white line-clamp-2 leading-tight mt-1 mb-2">${escapeHTML(item.nombre)}</h4>
                </div>
                <div class="flex justify-between items-end mt-auto pt-2 border-t border-gray-800">
                    <span class="font-bold text-cyan-400">$${fmt(item.precio)}</span>
                    ${stockHTML}
                </div>
            </div>
            ${sinStock ? '<div class="absolute inset-0 rounded-xl bg-black/30 flex items-center justify-center"><span class="bg-red-900 text-red-300 text-xs font-bold px-2 py-1 rounded">SIN STOCK</span></div>' : ''}
        `;
        fragment.appendChild(card);
    });

    grid.innerHTML = '';
    grid.appendChild(fragment);
    lucide.createIcons();
}

// Variable para debounce de búsqueda
let searchTimeout = null;

// --- 3. LÓGICA DEL CARRITO ---
function addToCart(item) {
    // BUG FIX: La búsqueda de duplicados no funcionaba correctamente con 'manual'
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
    // Actualizar stock local para mostrar cambio visual inmediato
    const invItem = allInventory.find(i => i.id === item.id && i.collection === item.collection);
    if (invItem && invItem.stock !== null && invItem.stock !== undefined) {
        invItem.stock = Math.max(0, invItem.stock - 1);
    }
    renderCartUI();
}

function updateCartQty(index, delta) {
    if (!cart[index]) return;

    // Restaurar stock local si se reduce cantidad
    const cartItem = cart[index];
    if (delta < 0) {
        const invItem = allInventory.find(i => i.id === cartItem.id && i.collection === cartItem.collection);
        if (invItem && invItem.stock !== null && invItem.stock !== undefined) {
            invItem.stock = invItem.stock + 1;
        }
    }

    cart[index].qty += delta;
    if (cart[index].qty <= 0) {
        cart.splice(index, 1);
    }
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
        subtotalEl.innerText = '$0';
        totalEl.innerText = '$0';
        btnCheckout.disabled = true;
        lucide.createIcons();
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

    // Event delegation: un solo listener en lugar de uno por botón
    container.querySelectorAll('button[data-delta]').forEach(btn => {
        btn.addEventListener('click', () => {
            updateCartQty(Number(btn.dataset.index), Number(btn.dataset.delta));
        });
    });

    subtotalEl.innerText = '$' + fmt(total);
    totalEl.innerText = '$' + fmt(total);
    btnCheckout.disabled = false;
    lucide.createIcons();
}

// --- 4. ARTÍCULO MANUAL ---
function openCustomItemModal() {
    getEl('modal-custom-item').classList.remove('hidden');
    setTimeout(() => getEl('custom-desc').focus(), 100);
}

function closeCustomModal() {
    getEl('modal-custom-item').classList.add('hidden');
    getEl('form-custom-item').reset();
}

document.addEventListener('DOMContentLoaded', () => {
    const formCustom = getEl('form-custom-item');
    if (formCustom) {
        formCustom.addEventListener('submit', (e) => {
            e.preventDefault();
            const desc = getEl('custom-desc').value.trim();
            const price = Math.abs(Number(getEl('custom-price').value)); // Siempre positivo

            if (!desc || price <= 0) return;

            // Los artículos manuales NO se deduplican, cada uno es único
            cart.push({
                id: `manual_${Date.now()}`, // ID único para que no se combinen
                collection: 'manual',
                nombre: desc,
                precio: price,
                qty: 1
            });

            renderCartUI();
            closeCustomModal();
        });
    }
});

// --- 5. CHECKOUT Y RECIBO ---
async function processCheckout() {
    if (cart.length === 0 || !loggedUser) return;

    const btnCheckout = getEl('btn-checkout');
    btnCheckout.innerHTML = '<i data-lucide="loader" class="w-5 h-5 animate-spin mr-2 inline"></i> PROCESANDO...';
    btnCheckout.disabled = true;
    lucide.createIcons();

    let total = 0;
    const articulosGuardar = cart.map(item => {
        const subtotal = item.precio * item.qty;
        total += subtotal;
        return {
            nombre: item.nombre,       // No guardar IDs internos en el registro de venta
            precio: item.precio,
            cantidad: item.qty,
            subtotal: subtotal,
            coleccion: item.collection // Referencia para auditoria
        };
    });

    try {
        const db = getDB();
        const batch = db.batch();

        // 1. Registrar la venta
        const ventaRef = db.collection("ventas").doc();
        batch.set(ventaRef, {
            vendedor_nombre: loggedUser.nombre,
            total: total,
            articulos: articulosGuardar,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        // 2. Descontar stock SOLO de artículos reales con stock definido
        for (const item of cart) {
            if (item.collection === 'manual') continue;
            const invItem = allInventory.find(i => i.id === item.id && i.collection === item.collection);
            if (invItem && invItem.stock !== null && invItem.stock !== undefined) {
                const docRef = db.collection(item.collection).doc(item.id);
                // Usar increment en lugar de set para evitar race conditions
                batch.update(docRef, {
                    stock: firebase.firestore.FieldValue.increment(-item.qty)
                });
            }
        }

        await batch.commit();

        lastSale = {
            id: ventaRef.id,
            fecha: new Date(),
            vendedor: loggedUser.nombre,
            articulos: articulosGuardar,
            total: total
        };

        // Mostrar modal de éxito
        getEl('receipt-total-msg').innerText = `Total cobrado: $${fmt(total)} COP`;
        getEl('modal-receipt').classList.remove('hidden');

        cart = [];
        renderCartUI();

    } catch (error) {
        console.error("Error al procesar venta:", error);
        alert("Error al procesar la venta: " + error.message);
    } finally {
        btnCheckout.innerHTML = '<i data-lucide="banknote" class="w-6 h-6"></i> COBRAR';
        btnCheckout.disabled = cart.length === 0;
        lucide.createIcons();
    }
}

function newSale() {
    getEl('modal-receipt').classList.add('hidden');
    lastSale = null;
    cargarInventario(); // Recargar para reflejar stocks actualizados
}

function printReceipt() {
    if (!lastSale) return;

    const printDate = getEl('print-date');
    const printCashier = getEl('print-cashier');
    const printTotal = getEl('print-total');
    const printItems = getEl('print-items');
    const ticketDiv = getEl('ticket-print');

    if (!printDate) return;

    printDate.innerText = lastSale.fecha.toLocaleString('es-CO');
    printCashier.innerText = `Cajero: ${escapeHTML(lastSale.vendedor)}`;
    printTotal.innerText = `TOTAL: $${fmt(lastSale.total)}`;

    let itemsHTML = '';
    lastSale.articulos.forEach(art => {
        itemsHTML += `
            <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;">
                <span>${art.cantidad}x ${escapeHTML(art.nombre)}</span>
                <span>$${fmt(art.subtotal)}</span>
            </div>`;
    });

    printItems.innerHTML = itemsHTML;
    ticketDiv.classList.remove('hidden');
    window.print();
    ticketDiv.classList.add('hidden');
}
