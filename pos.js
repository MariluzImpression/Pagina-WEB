// Configuración de Firebase (Igual que admin.js)
const firebaseConfig = {
    apiKey: "AIzaSyCpgNwZmq3rgC6ED9DZwWSRv9_DUxV3K-Y",
    authDomain: "impression-web-82c33.firebaseapp.com",
    projectId: "impression-web-82c33",
    storageBucket: "impression-web-82c33.firebasestorage.app",
    messagingSenderId: "622168477796",
    appId: "1:622168477796:web:2945f0a90ce92bdd4ecf71"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// --- Utilidades ---
function escapeHTML(str) {
    if (!str) return '';
    return str.toString().replace(/[&<>'"]/g, tag => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[tag] || tag));
}

// --- Variables Globales ---
let currentPin = "";
let loggedUser = null;
let allInventory = []; // Arreglo combinado de productos y catalogo
let cart = []; // Artículos en el carrito

// Elementos UI
const pinDisplay = document.getElementById('pin-display');
const loginError = document.getElementById('login-error');
const searchInput = document.getElementById('search-input');
const productsGrid = document.getElementById('products-grid');
const cartItemsContainer = document.getElementById('cart-items');
const cartTotalEl = document.getElementById('cart-total');
const cartSubtotalEl = document.getElementById('cart-subtotal');
const btnCheckout = document.getElementById('btn-checkout');

// --- 1. LÓGICA DE LOGIN CON PIN ---
function addPin(num) {
    if (currentPin.length < 6) {
        currentPin += num;
        updatePinDisplay();
    }
}

function clearPin() {
    currentPin = "";
    updatePinDisplay();
    loginError.classList.add('hidden');
}

function updatePinDisplay() {
    pinDisplay.value = '*'.repeat(currentPin.length);
}

async function loginPin() {
    if (currentPin.length < 4) {
        loginError.innerText = "El PIN debe tener al menos 4 dígitos.";
        loginError.classList.remove('hidden');
        return;
    }
    
    document.getElementById('btn-login-pin').innerHTML = '<i class="lucide-loader w-6 h-6 animate-spin"></i>';
    
    try {
        const querySnapshot = await db.collection("pos_users").where("pin", "==", currentPin).get();
        if (querySnapshot.empty) {
            loginError.innerText = "PIN Incorrecto o Cajero no encontrado.";
            loginError.classList.remove('hidden');
            clearPin();
        } else {
            loggedUser = querySnapshot.docs[0].data();
            document.getElementById('current-user-name').innerText = loggedUser.nombre;
            
            // Ocultar login y mostrar POS
            document.getElementById('login-screen').classList.add('hidden');
            document.getElementById('pos-screen').classList.remove('hidden');
            
            cargarInventario();
        }
    } catch (error) {
        console.error("Error al iniciar sesión:", error);
        loginError.innerText = "Error de conexión.";
        loginError.classList.remove('hidden');
    } finally {
        document.getElementById('btn-login-pin').innerHTML = '<i data-lucide="arrow-right" class="w-6 h-6"></i>';
        lucide.createIcons();
    }
}

function logoutPos() {
    loggedUser = null;
    cart = [];
    updateCartUI();
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('pos-screen').classList.add('hidden');
    clearPin();
}


// --- 2. CARGAR INVENTARIO ---
async function cargarInventario() {
    productsGrid.innerHTML = '<div class="col-span-full text-center py-20 text-gray-500">Cargando inventario desde Firebase...</div>';
    
    try {
        const [prodSnap, catSnap] = await Promise.all([
            db.collection("productos").get(),
            db.collection("catalogo").get()
        ]);
        
        allInventory = [];
        
        prodSnap.forEach(doc => {
            const d = doc.data();
            allInventory.push({ id: doc.id, collection: 'productos', ...d });
        });
        
        catSnap.forEach(doc => {
            const d = doc.data();
            allInventory.push({ id: doc.id, collection: 'catalogo', ...d });
        });
        
        // Ordenar alfabéticamente
        allInventory.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
        
        renderGrid(allInventory);
    } catch (error) {
        console.error("Error cargando inventario:", error);
        productsGrid.innerHTML = '<div class="col-span-full text-center text-red-500">Error cargando inventario. Revisa tu conexión.</div>';
    }
}

function renderGrid(items) {
    if (items.length === 0) {
        productsGrid.innerHTML = '<div class="col-span-full text-center py-20 text-gray-500">No se encontraron artículos.</div>';
        return;
    }
    
    let html = '';
    items.forEach(item => {
        const stockInfo = item.stock !== null && item.stock !== undefined ? `<div class="text-xs ${item.stock > 0 ? 'text-cyan-400' : 'text-red-500'}">Stock: ${item.stock}</div>` : '';
        const disabledClass = (item.stock !== null && item.stock !== undefined && item.stock <= 0) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-cyan-500 hover:-translate-y-1';
        const onClick = (item.stock !== null && item.stock !== undefined && item.stock <= 0) ? '' : `onclick="addToCart('${item.id}', '${item.collection}', '${escapeHTML(item.nombre).replace(/'/g, "\\'")}', ${item.precio})"`;

        html += `
            <div class="bg-gray-900 border border-gray-800 rounded-xl p-4 transition-all select-none flex flex-col h-full ${disabledClass}" ${onClick}>
                <div class="aspect-square bg-gray-800 rounded-lg mb-3 overflow-hidden">
                    ${item.tipo_media === 'video' ? `<video src="${escapeHTML(item.imagen)}" class="w-full h-full object-cover"></video>` : `<img src="${item.imagen ? escapeHTML(item.imagen) : ''}" onerror="this.style.display='none'" class="w-full h-full object-cover">`}
                </div>
                <div class="flex-1 flex flex-col justify-between">
                    <div>
                        <span class="text-[10px] text-gray-500 uppercase font-bold">${escapeHTML(item.categoria || 'Varios')}</span>
                        <h4 class="font-bold text-sm text-white line-clamp-2 leading-tight mt-1 mb-2">${escapeHTML(item.nombre)}</h4>
                    </div>
                    <div class="flex justify-between items-end mt-auto">
                        <span class="font-bold text-cyan-400">$${item.precio.toLocaleString('es-CO')}</span>
                        ${stockInfo}
                    </div>
                </div>
            </div>
        `;
    });
    productsGrid.innerHTML = html;
}

// Búsqueda
searchInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = allInventory.filter(item => 
        (item.nombre && item.nombre.toLowerCase().includes(term)) || 
        (item.categoria && item.categoria.toLowerCase().includes(term)) ||
        (item.desc && item.desc.toLowerCase().includes(term))
    );
    renderGrid(filtered);
});


// --- 3. LÓGICA DEL CARRITO ---
function addToCart(id, collection, name, price) {
    const existing = cart.find(item => item.id === id && item.collection === collection && id !== 'manual');
    if (existing) {
        existing.qty++;
    } else {
        cart.push({
            id: id,
            collection: collection,
            nombre: name,
            precio: price,
            qty: 1
        });
    }
    updateCartUI();
}

function updateCartQty(index, delta) {
    cart[index].qty += delta;
    if (cart[index].qty <= 0) {
        cart.splice(index, 1);
    }
    updateCartUI();
}

function removeFromCart(index) {
    cart.splice(index, 1);
    updateCartUI();
}

function updateCartUI() {
    if (cart.length === 0) {
        cartItemsContainer.innerHTML = `
            <div class="h-full flex flex-col items-center justify-center text-gray-600">
                <i data-lucide="shopping-bag" class="w-12 h-12 mb-2 opacity-50"></i>
                <p>El ticket está vacío</p>
            </div>
        `;
        cartSubtotalEl.innerText = '$0';
        cartTotalEl.innerText = '$0';
        btnCheckout.disabled = true;
        lucide.createIcons();
        return;
    }

    let html = '';
    let total = 0;

    cart.forEach((item, index) => {
        const itemTotal = item.precio * item.qty;
        total += itemTotal;
        html += `
            <div class="bg-gray-800 rounded-lg p-3 mb-2 flex justify-between items-center border border-gray-700">
                <div class="flex-1 pr-2">
                    <h5 class="text-sm font-bold text-white leading-tight mb-1">${escapeHTML(item.nombre)}</h5>
                    <p class="text-xs text-gray-400">$${item.precio.toLocaleString('es-CO')}</p>
                </div>
                <div class="flex items-center gap-3">
                    <div class="flex items-center bg-gray-900 rounded-lg">
                        <button class="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white transition-colors" onclick="updateCartQty(${index}, -1)">
                            <i data-lucide="minus" class="w-3 h-3"></i>
                        </button>
                        <span class="w-6 text-center text-sm font-bold">${item.qty}</span>
                        <button class="w-8 h-8 flex items-center justify-center text-cyan-400 hover:text-cyan-300 transition-colors" onclick="updateCartQty(${index}, 1)">
                            <i data-lucide="plus" class="w-3 h-3"></i>
                        </button>
                    </div>
                    <div class="w-16 text-right font-bold text-cyan-400 text-sm">
                        $${itemTotal.toLocaleString('es-CO')}
                    </div>
                </div>
            </div>
        `;
    });

    cartItemsContainer.innerHTML = html;
    cartSubtotalEl.innerText = '$' + total.toLocaleString('es-CO');
    cartTotalEl.innerText = '$' + total.toLocaleString('es-CO');
    btnCheckout.disabled = false;
    lucide.createIcons();
}

// --- 4. ARTÍCULO MANUAL ---
const formCustom = document.getElementById('form-custom-item');

function openCustomItemModal() {
    document.getElementById('modal-custom-item').classList.remove('hidden');
    document.getElementById('custom-desc').focus();
}

function closeCustomModal() {
    document.getElementById('modal-custom-item').classList.add('hidden');
    formCustom.reset();
}

formCustom.addEventListener('submit', (e) => {
    e.preventDefault();
    const desc = document.getElementById('custom-desc').value;
    const price = Number(document.getElementById('custom-price').value);
    
    // Lo agregamos al carrito con id 'manual' para que no se sume cantidad automáticamente a menos que sea exacto
    cart.push({
        id: 'manual',
        collection: 'manual',
        nombre: desc,
        precio: price,
        qty: 1
    });
    
    updateCartUI();
    closeCustomModal();
});

// --- 5. CHECKOUT Y RECIBO ---
let lastSale = null;

async function processCheckout() {
    if (cart.length === 0) return;
    
    btnCheckout.innerHTML = '<i class="lucide-loader w-6 h-6 animate-spin"></i> PROCESANDO...';
    btnCheckout.disabled = true;

    let total = 0;
    const articulosGuardar = cart.map(item => {
        total += item.precio * item.qty;
        return {
            id: item.id,
            collection: item.collection,
            nombre: item.nombre,
            precio: item.precio,
            cantidad: item.qty
        };
    });

    try {
        // Iniciar un Batch para guardar venta y actualizar stocks
        const batch = db.batch();

        // 1. Crear documento de Venta
        const ventaRef = db.collection("ventas").doc();
        const ventaData = {
            vendedor_nombre: loggedUser.nombre,
            vendedor_pin: loggedUser.pin,
            total: total,
            articulos: articulosGuardar,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };
        batch.set(ventaRef, ventaData);

        // 2. Descontar Stock de los productos (solo si tienen colección real y el campo stock existe en el array local)
        articulosGuardar.forEach(art => {
            if (art.collection !== 'manual') {
                const invItem = allInventory.find(i => i.id === art.id && i.collection === art.collection);
                if (invItem && invItem.stock !== null && invItem.stock !== undefined) {
                    const docRef = db.collection(art.collection).doc(art.id);
                    const newStock = Math.max(0, invItem.stock - art.cantidad);
                    batch.update(docRef, { stock: newStock });
                }
            }
        });

        // Ejecutar Batch
        await batch.commit();

        // Éxito: Guardar datos para recibo y mostrar modal
        lastSale = {
            id: ventaRef.id,
            fecha: new Date(),
            vendedor: loggedUser.nombre,
            articulos: articulosGuardar,
            total: total
        };

        document.getElementById('receipt-total-msg').innerText = `Total cobrado: $${total.toLocaleString('es-CO')} COP`;
        document.getElementById('modal-receipt').classList.remove('hidden');
        
        // Limpiar para la siguiente venta (se recargará el inventario en newSale para tener los stocks frescos)
        cart = [];
        updateCartUI();
        
    } catch (error) {
        console.error("Error al procesar venta:", error);
        alert("Ocurrió un error al cobrar la venta. Por favor intenta de nuevo.");
    } finally {
        btnCheckout.innerHTML = '<i data-lucide="banknote" class="w-6 h-6"></i> COBRAR';
        btnCheckout.disabled = false;
        lucide.createIcons();
    }
}

function newSale() {
    document.getElementById('modal-receipt').classList.add('hidden');
    lastSale = null;
    cargarInventario(); // Recargar para actualizar stocks
}

function printReceipt() {
    if (!lastSale) return;
    
    document.getElementById('print-date').innerText = lastSale.fecha.toLocaleString('es-CO');
    document.getElementById('print-cashier').innerText = `Cajero: ${lastSale.vendedor}`;
    document.getElementById('print-total').innerText = `TOTAL: $${lastSale.total.toLocaleString('es-CO')}`;
    
    let itemsHtml = '';
    lastSale.articulos.forEach(art => {
        itemsHtml += `
            <div class="flex justify-between text-xs mb-1">
                <span>${art.cantidad}x ${escapeHTML(art.nombre)}</span>
                <span>$${(art.precio * art.cantidad).toLocaleString('es-CO')}</span>
            </div>
        `;
    });
    document.getElementById('print-items').innerHTML = itemsHtml;
    
    window.print();
}

// Inicialización de iconos
document.addEventListener("DOMContentLoaded", () => {
    lucide.createIcons();
});
