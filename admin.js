// Tu configuración de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyCpgNwZmq3rgC6ED9DZwWSRv9_DUxV3K-Y",
  authDomain: "impression-web-82c33.firebaseapp.com",
  projectId: "impression-web-82c33",
  storageBucket: "impression-web-82c33.firebasestorage.app",
  messagingSenderId: "622168477796",
  appId: "1:622168477796:web:2945f0a90ce92bdd4ecf71"
};

// Inicializar Firebase usando la versión COMPAT (Funciona localmente sin servidor)
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// Utilidad de seguridad para prevenir XSS
function escapeHTML(str) {
    if (!str) return '';
    return str.toString().replace(/[&<>'"]/g, tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    }[tag] || tag));
}

// Secretos protegidos en Firestore (No quemados en el código)
let MAKE_WEBHOOK_URL = "";
let IMGBB_API_KEY = "";
// Credenciales de Cloudinary para videos
let CLOUDINARY_CLOUD_NAME = "dab6vcwfv"; 
let CLOUDINARY_UPLOAD_PRESET = "impression_videos";

async function notificarMake(tipo, data) {
    try {
        if (!MAKE_WEBHOOK_URL) {
            console.warn("Webhook URL no configurada, se omite notificación a Make");
            return;
        }

        // SOLUCIÓN DEFINITIVA PARA FACEBOOK REELS (Límite de 100-255 caracteres en Title)
        let textoBase = data.nombre || data.titulo || "Publicación de Impression";
        let tituloCorto = textoBase.substring(0, 95); // Seguro para cualquier red
        let descLarga = data.titulo || textoBase; // El texto enriquecido completo

        const payloadMake = {
            tipo: tipo,
            ...data,
            titulo_corto: tituloCorto,
            descripcion_larga: descLarga
        };

        await fetch(MAKE_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payloadMake)
        });
        console.log("Notificación enviada a Make.com exitosamente.");
    } catch(e) {
        console.error("Error al notificar a Make.com", e);
    }
}

// Variables de Interfaz (Login)
const loginScreen = document.getElementById('login-screen');
const dashboardScreen = document.getElementById('dashboard-screen');
const loginForm = document.getElementById('login-form');
const loginEmail = document.getElementById('login-email');
const loginPassword = document.getElementById('login-password');
const loginError = document.getElementById('login-error');
const userEmailDisplay = document.getElementById('user-email');
const logoutBtn = document.getElementById('logout-btn');

// ================= USUARIOS POS =================
const formPosUsuario = document.getElementById('form-pos-usuario');

// Guardar POS Usuario
formPosUsuario.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('pos-user-id').value;
    const btn = document.getElementById('btn-save-pos-usuario');
    
    try {
        btn.innerText = 'Guardando...';
        btn.disabled = true;

        const data = {
            nombre: document.getElementById('pos-user-nombre').value,
            pin: document.getElementById('pos-user-pin').value,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (id) {
            await db.collection("pos_users").doc(id).update(data);
        } else {
            // Verificar si el PIN ya existe
            const pinCheck = await db.collection("pos_users").where("pin", "==", data.pin).get();
            if(!pinCheck.empty) {
                alert("Ese PIN ya está en uso. Por favor, elige otro.");
                btn.innerText = 'Guardar';
                btn.disabled = false;
                return;
            }
            await db.collection("pos_users").add(data);
        }
        
        window.closeModal('pos-usuario');
        cargarPosUsuarios();
    } catch (error) {
        console.error("Error al guardar usuario POS:", error);
        alert("Error al guardar: " + error.message);
    } finally {
        btn.innerText = 'Guardar';
        btn.disabled = false;
    }
});

function cargarPosUsuarios() {
    db.collection("pos_users").orderBy("timestamp", "desc").onSnapshot(snapshot => {
        const list = document.getElementById('pos-usuarios-list');
        if (snapshot.empty) {
            list.innerHTML = '<div class="col-span-full text-center py-10 text-gray-500">Aún no hay cajeros creados.</div>';
            return;
        }
        let html = '';
        snapshot.forEach(doc => {
            const d = doc.data();
            const dataStr = JSON.stringify(d).replace(/"/g, '&quot;');
            html += `
                <div class="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden p-4 relative flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full bg-cyan-900 flex items-center justify-center text-cyan-400">
                            <i data-lucide="user" class="w-5 h-5"></i>
                        </div>
                        <div>
                            <h4 class="font-bold text-white">${escapeHTML(d.nombre)}</h4>
                            <p class="text-xs text-gray-500">PIN: ${d.pin}</p>
                        </div>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="editPosUsuario('${doc.id}', '${dataStr}')" class="w-8 h-8 bg-blue-900 hover:bg-blue-800 text-blue-400 rounded flex items-center justify-center transition-colors"><i data-lucide="edit-2" class="w-4 h-4"></i></button>
                        <button onclick="eliminarDoc('pos_users', '${doc.id}')" class="w-8 h-8 bg-red-900 hover:bg-red-800 text-red-400 rounded flex items-center justify-center transition-colors"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                    </div>
                </div>
            `;
        });
        list.innerHTML = html;
        lucide.createIcons();
    });
}

function editPosUsuario(id, dataStr) {
    const data = JSON.parse(dataStr.replace(/&quot;/g, '"'));
    document.getElementById('form-pos-usuario').reset();
    document.getElementById('pos-user-id').value = id;
    document.getElementById('pos-user-nombre').value = data.nombre;
    document.getElementById('pos-user-pin').value = data.pin;
    window.openModal('pos-usuario');
}

// ================= VENTAS (HISTORIAL) =================
function cargarVentas() {
    db.collection("ventas").orderBy("timestamp", "desc").limit(50).onSnapshot(snapshot => {
        const list = document.getElementById('ventas-list');
        if (snapshot.empty) {
            list.innerHTML = '<tr><td colspan="4" class="text-center py-10 text-gray-500">No hay ventas registradas aún.</td></tr>';
            return;
        }
        let html = '';
        snapshot.forEach(doc => {
            const v = doc.data();
            const date = v.timestamp ? v.timestamp.toDate().toLocaleString('es-CO') : 'Reciente';
            
            let articulosHtml = '<ul class="list-disc pl-4 text-xs text-gray-400">';
            v.articulos.forEach(art => {
                articulosHtml += `<li>${art.cantidad}x ${escapeHTML(art.nombre)} ($${(art.precio * art.cantidad).toLocaleString('es-CO')})</li>`;
            });
            articulosHtml += '</ul>';

            html += `
                <tr class="hover:bg-gray-800 transition-colors">
                    <td class="px-6 py-4 whitespace-nowrap text-white">${date}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-cyan-400"><i data-lucide="user" class="w-3 h-3 inline mr-1"></i>${escapeHTML(v.vendedor_nombre)}</td>
                    <td class="px-6 py-4">${articulosHtml}</td>
                    <td class="px-6 py-4 whitespace-nowrap font-bold text-green-400">$${v.total.toLocaleString('es-CO')}</td>
                </tr>
            `;
        });
        list.innerHTML = html;
        lucide.createIcons();
    });
}

// --- 1. LÓGICA DE AUTENTICACIÓN (LOGIN) ---

// Escuchar si el usuario está logueado o no
auth.onAuthStateChanged(async (user) => {
    if (user) {
        // Extraer Secretos de la Base de Datos
        try {
            const configDoc = await db.collection("config").doc("secrets").get();
            if (configDoc.exists) {
                const secrets = configDoc.data();
                MAKE_WEBHOOK_URL = secrets.make_webhook || "";
                IMGBB_API_KEY = secrets.imgbb_key || "";
            } else {
                // Auto-configuración inicial (Guarda las llaves actuales en Firestore para la próxima vez)
                const defaultSecrets = {
                    make_webhook: "https://hook.us2.make.com/0fc9d73m1gxd8dllmxdl349gmnv1a221",
                    imgbb_key: "bb9a038e12fb6cfaee4a2e3fce81225f"
                };
                await db.collection("config").doc("secrets").set(defaultSecrets);
                MAKE_WEBHOOK_URL = defaultSecrets.make_webhook;
                IMGBB_API_KEY = defaultSecrets.imgbb_key;
                console.log("Secretos auto-configurados en Firebase");
            }
        } catch(e) {
            console.error("Error obteniendo secretos:", e);
        }

        // Está conectado: Mostrar Panel
        loginScreen.classList.add('hidden');
        dashboardScreen.classList.remove('hidden');
        userEmailDisplay.innerText = user.email;
        // Cargar los datos
        cargarProductos();
        cargarPromociones();
        cargarServicios();
        cargarGaleria();
        cargarCatalogo();
        cargarPosUsuarios();
        cargarVentas();
        if(window.cargarTV) cargarTV();
    } else {
        // No está conectado: Mostrar Login
        loginScreen.classList.remove('hidden');
        dashboardScreen.classList.add('hidden');
    }
});

// Botón de Iniciar Sesión
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = loginEmail.value;
    const password = loginPassword.value;
    const btn = document.getElementById('login-btn');
    
    try {
        loginError.classList.add('hidden');
        btn.innerText = 'Cargando...';
        btn.disabled = true;
        
        await auth.signInWithEmailAndPassword(email, password);
        // Si es exitoso, el onAuthStateChanged de arriba se encarga de mostrar el panel
    } catch (error) {
        console.error("Error de login:", error);
        loginError.classList.remove('hidden');
    } finally {
        btn.innerText = 'Iniciar Sesión';
        btn.disabled = false;
    }
});

// Botón de Salir
logoutBtn.addEventListener('click', () => {
    auth.signOut();
});

// --- 2. LÓGICA DE BASE DE DATOS (CRUD) ---

// ================= PRODUCTOS =================
const formProducto = document.getElementById('form-producto');

// Guardar/Actualizar Producto
formProducto.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('prod-id').value;
    const fileInput = document.getElementById('prod-imagen');
    const btn = document.getElementById('btn-save-producto');

    try {
        btn.innerText = 'Subiendo...';
        btn.disabled = true;

        let imageUrl = '';
        let tipoMedia = 'imagen';
        if (fileInput.files.length > 0) {
            const result = await uploadMedia(fileInput.files[0], (progreso) => {
                btn.innerText = `Subiendo... ${progreso}%`;
            });
            imageUrl = result.url;
            tipoMedia = result.tipo_media;
        }

        if (!id && !imageUrl) {
            throw new Error("Por favor, selecciona una foto o video para el producto.");
        }

        const data = {
            nombre: document.getElementById('prod-nombre').value,
            categoria: document.getElementById('prod-categoria').value,
            desc: document.getElementById('prod-desc').value,
            precio: Number(document.getElementById('prod-precio').value),
            precio_old: Number(document.getElementById('prod-precio-old').value) || null,
            stock: document.getElementById('prod-stock').value ? Number(document.getElementById('prod-stock').value) : null,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (imageUrl) {
            data.imagen = imageUrl;
            data.tipo_media = tipoMedia;
        }

        const destino = document.querySelector('input[name="dest-producto"]:checked').value;

        if (destino === 'ambas' || destino === 'pagina') {
            if (id) {
                await db.collection("productos").doc(id).update(data);
            } else {
                await db.collection("productos").add(data);
            }
        }
        
        if (destino === 'ambas' || destino === 'redes') {
            const formato = document.querySelector('input[name="formato-producto"]:checked').value;
            const tituloEnriquecido = `🛍️ ${data.nombre}\nCategoría: ${data.categoria}\n\n${data.desc}\n\nPrecio: $${data.precio.toLocaleString('es-CO')} COP`;
            const makeData = { ...data, titulo: tituloEnriquecido, formato_redes: formato };
            delete makeData.timestamp; // Make.com no entiende objetos Firebase ServerTimestamp
            notificarMake("nuevo_producto", makeData);
        }
        
        await checkAndSendToTV('tv-producto', 'productos', id, imageUrl, tipoMedia);

        fileInput.value = '';
        window.closeModal('producto');
        cargarProductos();
    } catch (error) {
        alert("Error guardando producto: " + error.message);
    } finally {
        btn.innerText = 'Guardar Producto';
        btn.disabled = false;
    }
});

// Cargar Productos
async function cargarProductos() {
    const list = document.getElementById('productos-list');
    list.innerHTML = '<div class="col-span-full text-center text-gray-400">Cargando...</div>';
    
    try {
        const querySnapshot = await db.collection("productos").get();
        list.innerHTML = '';
        
        if(querySnapshot.empty) {
            list.innerHTML = '<div class="col-span-full text-center text-gray-500 py-10">No hay productos. ¡Agrega uno!</div>';
            return;
        }

        const fragment = document.createDocumentFragment();
        querySnapshot.forEach((docSnap) => {
            const p = docSnap.data();
            const id = docSnap.id;
            
            const card = document.createElement('div');
            card.className = "bg-gray-900 border border-gray-800 rounded-xl p-5 relative group";
            card.innerHTML = `
                <div class="flex justify-between items-start mb-4">
                    <div class="w-12 h-12 rounded-lg bg-gray-800 flex items-center justify-center overflow-hidden border border-gray-700">
                        ${p.tipo_media === 'video' ? `<video src="${escapeHTML(p.imagen)}" autoplay loop muted playsinline class="w-full h-full object-cover"></video>` : `<img src="${p.imagen ? escapeHTML(p.imagen) : ''}" onerror="this.src='https://placehold.co/100x100?text=Prod'" class="w-full h-full object-cover">`}
                    </div>
                    <div class="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onclick="editarProducto('${id}')" class="text-gray-400 hover:text-blue-400"><i data-lucide="edit" class="w-4 h-4"></i></button>
                        <button onclick="eliminarDoc('productos', '${id}')" class="text-gray-400 hover:text-red-500"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                    </div>
                </div>
                <span class="text-[10px] bg-pink-600/20 text-pink-400 px-2 py-1 rounded">${escapeHTML(p.categoria)}</span>
                <h3 class="font-bold mt-2 mb-1 truncate">${escapeHTML(p.nombre)}</h3>
                <p class="text-xs text-gray-500 mb-3 line-clamp-2">${escapeHTML(p.desc)}</p>
                <div class="font-bold text-lg text-white">$${Number(p.precio).toLocaleString('es-CO')} ${p.stock !== null && p.stock !== undefined ? `<span class="text-xs text-cyan-400">Stock: ${p.stock}</span>` : ''}</div>
            `;
            fragment.appendChild(card);
        });
        list.appendChild(fragment);
        lucide.createIcons();
    } catch (error) {
        list.innerHTML = '<div class="col-span-full text-center text-red-500">Error al cargar datos.</div>';
    }
}

// Editar Producto
window.editarProducto = async (id) => {
    const querySnapshot = await db.collection("productos").get();
    querySnapshot.forEach((docSnap) => {
        if(docSnap.id === id) {
            const p = docSnap.data();
            document.getElementById('prod-id').value = id;
            document.getElementById('prod-nombre').value = p.nombre;
            document.getElementById('prod-categoria').value = p.categoria;
            document.getElementById('prod-desc').value = p.desc;
            document.getElementById('prod-precio').value = p.precio;
            document.getElementById('prod-precio-old').value = p.precio_old || '';
            document.getElementById('prod-stock').value = p.stock !== null && p.stock !== undefined ? p.stock : '';
            document.getElementById('prod-imagen').value = '';
            
            document.getElementById('modal-producto-title').innerText = 'Editar Producto';
            document.getElementById('modal-producto').classList.remove('hidden');
        }
    });
};


// ================= PROMOCIONES =================
const formPromocion = document.getElementById('form-promocion');

formPromocion.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('promo-id').value;
    const fileInput = document.getElementById('promo-imagen');
    const btn = e.target.querySelector('button[type="submit"]');
    
    try {
        btn.innerText = 'Subiendo...';
        btn.disabled = true;

        let imageUrl = '';
        let tipoMedia = 'imagen';
        if (fileInput.files.length > 0) {
            const result = await uploadMedia(fileInput.files[0], (progreso) => {
                btn.innerText = `Subiendo... ${progreso}%`;
            });
            imageUrl = result.url;
            tipoMedia = result.tipo_media;
        }

        if (!id && !imageUrl) {
            throw new Error("Por favor, selecciona una foto o video para la promoción.");
        }

        const data = {
            nombre: document.getElementById('promo-nombre').value,
            descuento: document.getElementById('promo-descuento').value,
            desc: document.getElementById('promo-desc').value,
            precio: Number(document.getElementById('promo-precio').value),
            precio_old: Number(document.getElementById('promo-precio-old').value) || null,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (imageUrl) {
            data.imagen = imageUrl;
            data.tipo_media = tipoMedia;
        }

        const destino = document.querySelector('input[name="dest-promocion"]:checked').value;

        if (destino === 'ambas' || destino === 'pagina') {
            if (id) {
                await db.collection("promociones").doc(id).update(data);
            } else {
                await db.collection("promociones").add(data);
            }
        }
        
        if (destino === 'ambas' || destino === 'redes') {
            const formato = document.querySelector('input[name="formato-promocion"]:checked').value;
            const tituloEnriquecido = `🔥 ${data.nombre} 🔥\n🏷️ ${data.descuento}\n\n${data.desc}\n\n${data.precio_old ? `❌ Normal: $${data.precio_old.toLocaleString('es-CO')}\n` : ''}✅ Promo: $${data.precio.toLocaleString('es-CO')} COP`;
            const makeData = { ...data, titulo: tituloEnriquecido, formato_redes: formato };
            delete makeData.timestamp; // Make.com no entiende objetos Firebase ServerTimestamp
            notificarMake("nueva_promocion", makeData);
        }
        
        await checkAndSendToTV('tv-promocion', 'promociones', id, imageUrl, tipoMedia);

        fileInput.value = '';
        window.closeModal('promocion');
        cargarPromociones();
    } catch (error) {
        alert("Error guardando promoción: " + error.message);
    } finally {
        btn.innerText = 'Guardar Promoción';
        btn.disabled = false;
    }
});

async function cargarPromociones() {
    const list = document.getElementById('promociones-list');
    list.innerHTML = '<div class="col-span-full text-center text-gray-400">Cargando...</div>';
    try {
        const querySnapshot = await db.collection("promociones").get();
        list.innerHTML = '';
        if(querySnapshot.empty) { list.innerHTML = '<div class="col-span-full text-center text-gray-500 py-10">No hay promociones.</div>'; return; }

        const fragment = document.createDocumentFragment();
        querySnapshot.forEach((docSnap) => {
            const p = docSnap.data();
            const id = docSnap.id;
            const card = document.createElement('div');
            card.className = "bg-gray-900 border border-gray-800 rounded-xl p-5 relative group flex gap-4";
            card.innerHTML = `
                <div class="w-16 h-16 rounded-xl bg-gray-800 flex items-center justify-center flex-shrink-0 overflow-hidden border border-gray-700">
                    ${p.tipo_media === 'video' ? `<video src="${escapeHTML(p.imagen)}" autoplay loop muted playsinline class="w-full h-full object-cover"></video>` : `<img src="${p.imagen ? escapeHTML(p.imagen) : ''}" onerror="this.src='https://placehold.co/100x100?text=Sin+Foto'" class="w-full h-full object-cover">`}
                </div>
                <div class="flex-1">
                    <div class="flex justify-between items-start">
                        <span class="text-[10px] bg-yellow-500/20 text-yellow-500 px-2 py-1 rounded font-bold">${escapeHTML(p.descuento)}</span>
                        <div class="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onclick="editarPromocion('${id}')" class="text-gray-400 hover:text-blue-400"><i data-lucide="edit" class="w-4 h-4"></i></button>
                            <button onclick="eliminarDoc('promociones', '${id}')" class="text-gray-400 hover:text-red-500"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                        </div>
                    </div>
                    <h3 class="font-bold mt-2 truncate">${escapeHTML(p.nombre)}</h3>
                    <p class="text-xs text-gray-500 mb-2 line-clamp-2">${escapeHTML(p.desc)}</p>
                    <div class="font-bold text-lg text-white">$${Number(p.precio).toLocaleString('es-CO')}</div>
                </div>
            `;
            fragment.appendChild(card);
        });
        list.appendChild(fragment);
        lucide.createIcons();
    } catch (error) { list.innerHTML = '<div class="col-span-full text-center text-red-500">Error al cargar.</div>'; }
}

window.editarPromocion = async (id) => {
    const querySnapshot = await db.collection("promociones").get();
    querySnapshot.forEach((docSnap) => {
        if(docSnap.id === id) {
            const p = docSnap.data();
            document.getElementById('promo-id').value = id;
            document.getElementById('promo-nombre').value = p.nombre;
            document.getElementById('promo-descuento').value = p.descuento;
            document.getElementById('promo-desc').value = p.desc;
            document.getElementById('promo-precio').value = p.precio;
            document.getElementById('promo-precio-old').value = p.precio_old || '';
            // Limpiar el input de imagen para que no intente re-subir la misma al editar si no la cambia
            document.getElementById('promo-imagen').value = '';
            document.getElementById('modal-promocion-title').innerText = 'Editar Promoción';
            document.getElementById('modal-promocion').classList.remove('hidden');
        }
    });
};


// ================= SERVICIOS =================
const formServicio = document.getElementById('form-servicio');

formServicio.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('serv-id').value;
    const fileInput = document.getElementById('serv-imagen');
    const btn = e.target.querySelector('button[type="submit"]');

    try {
        btn.innerText = 'Subiendo...';
        btn.disabled = true;

        let imageUrl = '';
        let tipoMedia = 'imagen';
        if (fileInput.files.length > 0) {
            const result = await uploadMedia(fileInput.files[0], (progreso) => {
                btn.innerText = `Subiendo... ${progreso}%`;
            });
            imageUrl = result.url;
            tipoMedia = result.tipo_media;
        }

        if (!id && !imageUrl) {
            throw new Error("Por favor, selecciona una foto o video para el servicio.");
        }

        const data = {
            titulo: document.getElementById('serv-titulo').value,
            desc: document.getElementById('serv-desc').value,
            color: document.getElementById('serv-color').value,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (imageUrl) {
            data.imagen = imageUrl;
            data.tipo_media = tipoMedia;
        }

        const destino = document.querySelector('input[name="dest-servicio"]:checked').value;

        if (destino === 'ambas' || destino === 'pagina') {
            if (id) {
                await db.collection("servicios").doc(id).update(data);
            } else {
                await db.collection("servicios").add(data);
            }
        }
        
        if (destino === 'ambas' || destino === 'redes') {
            const formato = document.querySelector('input[name="formato-servicio"]:checked').value;
            const tituloEnriquecido = `🛠️ ${data.titulo}\n\n${data.desc}\n\nConoce más sobre este servicio en nuestra página web oficial o contáctanos por WhatsApp.`;
            const makeData = { ...data, titulo: tituloEnriquecido, formato_redes: formato };
            delete makeData.timestamp; // Make.com no entiende objetos Firebase ServerTimestamp
            notificarMake("nuevo_servicio", makeData);
        }
        
        await checkAndSendToTV('tv-servicio', 'servicios', id, imageUrl, tipoMedia);

        fileInput.value = '';
        window.closeModal('servicio');
        cargarServicios();
    } catch (error) {
        alert("Error guardando servicio: " + error.message);
    } finally {
        btn.innerText = 'Guardar Servicio';
        btn.disabled = false;
    }
});

async function cargarServicios() {
    const list = document.getElementById('servicios-list');
    list.innerHTML = '<div class="col-span-full text-center text-gray-400">Cargando...</div>';
    try {
        const querySnapshot = await db.collection("servicios").get();
        list.innerHTML = '';
        if(querySnapshot.empty) { list.innerHTML = '<div class="col-span-full text-center text-gray-500 py-10">No hay servicios.</div>'; return; }

        const fragment = document.createDocumentFragment();
        querySnapshot.forEach((docSnap) => {
            const p = docSnap.data();
            const id = docSnap.id;
            
            // Map colors for UI
            let colorHex = "#fff";
            if(p.color === "brand-yellow") colorHex = "#FFF000";
            if(p.color === "brand-pink") colorHex = "#FF007F";
            if(p.color === "brand-blue") colorHex = "#00BFFF";
            if(p.color === "brand-orange") colorHex = "#FF8C00";
            if(p.color === "brand-purple") colorHex = "#8A2BE2";

            const card = document.createElement('div');
            card.className = "bg-gray-900 border border-gray-800 rounded-xl p-5 relative group";
            card.innerHTML = `
                <div class="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onclick="editarServicio('${id}')" class="text-gray-400 hover:text-blue-400 bg-gray-800 p-1 rounded"><i data-lucide="edit" class="w-4 h-4"></i></button>
                    <button onclick="eliminarDoc('servicios', '${id}')" class="text-gray-400 hover:text-red-500 bg-gray-800 p-1 rounded"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </div>
                <div class="w-12 h-12 rounded-xl bg-black border-2 flex items-center justify-center mb-4 overflow-hidden" style="border-color: ${colorHex}">
                    ${p.tipo_media === 'video' ? `<video src="${escapeHTML(p.imagen)}" autoplay loop muted playsinline class="w-full h-full object-cover"></video>` : `<img src="${p.imagen ? escapeHTML(p.imagen) : ''}" onerror="this.src='https://placehold.co/100x100?text=Serv'" class="w-full h-full object-cover">`}
                </div>
                <h3 class="font-bold mt-2 mb-2">${escapeHTML(p.titulo)}</h3>
                <p class="text-xs text-gray-500">${escapeHTML(p.desc)}</p>
            `;
            fragment.appendChild(card);
        });
        list.appendChild(fragment);
        lucide.createIcons();
    } catch (error) { list.innerHTML = '<div class="col-span-full text-center text-red-500">Error al cargar.</div>'; }
}

window.editarServicio = async (id) => {
    const querySnapshot = await db.collection("servicios").get();
    querySnapshot.forEach((docSnap) => {
        if(docSnap.id === id) {
            const p = docSnap.data();
            document.getElementById('serv-id').value = id;
            document.getElementById('serv-titulo').value = p.titulo;
            document.getElementById('serv-desc').value = p.desc;
            document.getElementById('serv-imagen').value = '';
            document.getElementById('serv-color').value = p.color;
            document.getElementById('modal-servicio-title').innerText = 'Editar Servicio';
            document.getElementById('modal-servicio').classList.remove('hidden');
        }
    });
};

// ================= GALERÍA =================
const formGaleria = document.getElementById('form-galeria');

// Función auxiliar para redimensionar y convertir a Base64
function resizeImageAndGetBase64(file, maxWidth = 800) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                // Comprimir a JPEG 0.8 para no ocupar tanto espacio
                resolve(canvas.toDataURL('image/jpeg', 0.8));
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Función global para subir multimedia (Cloudinary para videos, ImgBB para fotos)
async function uploadMedia(file, onProgress) {
    if (file.type.startsWith('video/')) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`;
            
            xhr.open('POST', url, true);
            
            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable && onProgress) {
                    const progress = Math.round((e.loaded / e.total) * 100);
                    onProgress(progress);
                }
            };
            
            xhr.onload = () => {
                if (xhr.status === 200) {
                    const response = JSON.parse(xhr.responseText);
                    resolve({ url: response.secure_url, tipo_media: 'video' });
                } else {
                    reject(new Error(`Error de Cloudinary (${xhr.status})`));
                }
            };
            
            xhr.onerror = () => reject(new Error("Error de red al conectar con Cloudinary."));
            
            const formData = new FormData();
            formData.append('file', file);
            formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
            
            xhr.send(formData);
        });
    } else {
        try {
            const base64Full = await resizeImageAndGetBase64(file);
            const base64Data = base64Full.split(',')[1];
            const formData = new FormData();
            formData.append("image", base64Data);
            
            const imgbbResponse = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
                method: "POST",
                body: formData
            });
            const imgbbResult = await imgbbResponse.json();
            
            if (imgbbResult.success) {
                return { url: imgbbResult.data.url, tipo_media: 'imagen' };
            } else {
                throw new Error("ImgBB rechazó la imagen");
            }
        } catch (err) {
            console.warn("Fallo al subir a ImgBB", err);
            const fallbackUrl = await resizeImageAndGetBase64(file);
            return { url: fallbackUrl, tipo_media: 'imagen' };
        }
    }
}

formGaleria.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fileInput = document.getElementById('galeria-file');
    const file = fileInput.files[0];
    if (!file) return;

    try {
        const btn = document.getElementById('btn-save-galeria');
        btn.innerText = 'Subiendo...';
        btn.disabled = true;

        let imageUrl = '';
        let tipoMedia = 'imagen';
        
        const result = await uploadMedia(file, (progreso) => {
            btn.innerText = `Subiendo... ${progreso}%`;
        });
        imageUrl = result.url;
        tipoMedia = result.tipo_media;
        
        const data = {
            titulo: document.getElementById('galeria-titulo').value || '',
            imagen: imageUrl,
            tipo_media: tipoMedia,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };

        const destino = document.querySelector('input[name="dest-galeria"]:checked').value;

        if (destino === 'ambas' || destino === 'pagina') {
            await db.collection("galeria").add(data);
        }
        
        if (destino === 'ambas' || destino === 'redes') {
            const formato = document.querySelector('input[name="formato-galeria"]:checked').value;
            const makeData = { ...data, formato_redes: formato };
            delete makeData.timestamp; 
            notificarMake("nueva_galeria", makeData);
        }
        
        await checkAndSendToTV('tv-galeria', 'galeria', null, imageUrl, tipoMedia);

        window.closeModal('galeria');
        cargarGaleria();
    } catch (error) {
        alert("Error guardando foto: " + error.message);
    } finally {
        const btn = document.getElementById('btn-save-galeria');
        btn.innerText = 'Subir Foto';
        btn.disabled = false;
    }
});

async function cargarGaleria() {
    const list = document.getElementById('galeria-list');
    if (!list) return;
    list.innerHTML = '<div class="col-span-full text-center text-gray-400">Cargando fotos...</div>';
    try {
        const querySnapshot = await db.collection("galeria").orderBy("timestamp", "desc").get();
        list.innerHTML = '';
        if(querySnapshot.empty) { list.innerHTML = '<div class="col-span-full text-center text-gray-500 py-10">No hay fotos en la galería.</div>'; return; }

        const fragment = document.createDocumentFragment();
        querySnapshot.forEach((docSnap) => {
            const p = docSnap.data();
            const id = docSnap.id;
            
            const card = document.createElement('div');
            card.className = "bg-gray-900 border border-gray-800 rounded-xl overflow-hidden relative group aspect-square";
            card.innerHTML = `
                ${p.tipo_media === 'video' ? `<video src="${escapeHTML(p.imagen)}" autoplay loop muted playsinline class="w-full h-full object-cover"></video>` : `<img src="${p.imagen}" class="w-full h-full object-cover" alt="Trabajo">`}
                <div class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-center items-center p-4">
                    <p class="text-white text-sm font-bold text-center mb-4 truncate w-full">${escapeHTML(p.titulo)}</p>
                    <button onclick="eliminarDoc('galeria', '${id}')" class="bg-red-600 hover:bg-red-500 text-white px-3 py-1 rounded flex items-center gap-2 text-sm"><i data-lucide="trash-2" class="w-4 h-4"></i> Eliminar</button>
                </div>
            `;
            fragment.appendChild(card);
        });
        list.appendChild(fragment);
        lucide.createIcons();
    } catch (error) { list.innerHTML = '<div class="col-span-full text-center text-red-500">Error al cargar galería.</div>'; }
}

// ================= FUNCIÓN GLOBAL ELIMINAR =================
window.eliminarDoc = async (coleccion, id) => {
    if(confirm("¿Estás seguro de que quieres eliminar esto? Esta acción no se puede deshacer.")) {
        try {
            await db.collection(coleccion).doc(id).delete();
            if(coleccion === 'productos') cargarProductos();
            if(coleccion === 'promociones') cargarPromociones();
            if(coleccion === 'servicios') cargarServicios();
            if(coleccion === 'galeria') cargarGaleria();
            if(coleccion === 'catalogo') cargarCatalogo();
            if(coleccion === 'pos_users') cargarPosUsuarios();
        } catch(error) {
            alert("Error al eliminar: " + error.message);
        }
    }
};

// ================= CRUD CATÁLOGO =================

document.getElementById('form-catalogo').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        const id = document.getElementById('cat-id').value;
        const nombre = document.getElementById('cat-nombre').value;
        const categoria = document.getElementById('cat-categoria').value;
        const desc = document.getElementById('cat-desc').value;
        const precio = parseFloat(document.getElementById('cat-precio').value) || 0;
        const stock = document.getElementById('cat-stock').value ? Number(document.getElementById('cat-stock').value) : null;
        const fileInput = document.getElementById('cat-imagen');
        
        const btn = document.getElementById('btn-save-catalogo');
        btn.innerText = 'Guardando...';
        btn.disabled = true;

        let imageUrl = '';
        let tipoMedia = 'imagen';
        
        if (fileInput.files.length > 0) {
            const result = await uploadMedia(fileInput.files[0], (progreso) => {
                btn.innerText = `Subiendo... ${progreso}%`;
            });
            imageUrl = result.url;
            tipoMedia = result.tipo_media;
        }

        const data = {
            nombre,
            categoria,
            desc,
            precio,
            stock,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        if (imageUrl) {
            data.imagen = imageUrl;
            data.tipo_media = tipoMedia;
        }

        const destino = document.querySelector('input[name="dest-catalogo"]:checked').value;

        if (destino === 'ambas' || destino === 'pagina') {
            if (id) {
                await db.collection("catalogo").doc(id).update(data);
            } else {
                await db.collection("catalogo").add(data);
            }
        }
        
        if (destino === 'ambas' || destino === 'redes') {
            const formato = document.querySelector('input[name="formato-catalogo"]:checked').value;
            const tituloEnriquecido = `📦 ${data.nombre}\nCategoría: ${data.categoria}\n\n${data.desc}\n\nPrecio: $${data.precio.toLocaleString('es-CO')} COP`;
            const makeData = { ...data, titulo: tituloEnriquecido, formato_redes: formato };
            delete makeData.timestamp; 
            notificarMake("nuevo_catalogo", makeData);
        }

        await checkAndSendToTV('tv-catalogo', 'catalogo', id, imageUrl, tipoMedia);

        window.closeModal('catalogo');
        cargarCatalogo();
    } catch (error) {
        alert("Error guardando catálogo: " + error.message);
    } finally {
        const btn = document.getElementById('btn-save-catalogo');
        btn.innerText = 'Guardar Artículo';
        btn.disabled = false;
    }
});

async function cargarCatalogo() {
    const list = document.getElementById('catalogo-list');
    if (!list) return;
    list.innerHTML = '<div class="col-span-full text-center text-gray-400">Cargando catálogo...</div>';
    try {
        const querySnapshot = await db.collection("catalogo").orderBy("timestamp", "desc").get();
        list.innerHTML = '';
        if(querySnapshot.empty) { list.innerHTML = '<div class="col-span-full text-center text-gray-500 py-10">No hay artículos en el catálogo.</div>'; return; }

        const fragment = document.createDocumentFragment();
        querySnapshot.forEach((docSnap) => {
            const d = docSnap.data();
            const id = docSnap.id;
            
            const card = document.createElement('div');
            card.className = "bg-gray-900 border border-gray-800 rounded-xl overflow-hidden relative group";
            card.innerHTML = `
                <div class="aspect-square relative overflow-hidden bg-gray-800">
                    ${d.tipo_media === 'video' ? `<video src="${escapeHTML(d.imagen)}" autoplay loop muted playsinline class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"></video>` : (d.imagen ? `<img src="${d.imagen}" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt="${escapeHTML(d.nombre)}">` : '<div class="w-full h-full flex items-center justify-center text-gray-500"><i data-lucide="image" class="w-10 h-10"></i></div>')}
                </div>
                <div class="p-4">
                    <span class="text-xs text-green-500 font-bold uppercase tracking-wider mb-1 block">${escapeHTML(d.categoria || '')}</span>
                    <h4 class="text-white font-bold truncate">${escapeHTML(d.nombre)}</h4>
                    <p class="text-green-400 font-bold mt-2">$${d.precio ? d.precio.toLocaleString() : '0'} ${d.stock !== null && d.stock !== undefined ? `<span class="ml-2 text-xs text-cyan-400">Stock: ${d.stock}</span>` : ''}</p>
                    <div class="flex gap-2 mt-4 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onclick="editarCatalogo('${id}')" class="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-1 rounded text-sm transition-colors flex justify-center items-center gap-1"><i data-lucide="edit" class="w-3 h-3"></i> Editar</button>
                        <button onclick="eliminarDoc('catalogo', '${id}')" class="bg-red-600 hover:bg-red-500 text-white px-3 py-1 rounded transition-colors"><i data-lucide="trash-2" class="w-3 h-3"></i></button>
                    </div>
                </div>
            `;
            fragment.appendChild(card);
        });
        list.appendChild(fragment);
        lucide.createIcons();
    } catch (error) { list.innerHTML = '<div class="col-span-full text-center text-red-500">Error al cargar catálogo.</div>'; }
}

window.editarCatalogo = async (id) => {
    try {
        const docSnap = await db.collection("catalogo").doc(id).get();
        if(docSnap.exists) {
            const data = docSnap.data();
            document.getElementById('cat-id').value = id;
            document.getElementById('cat-nombre').value = data.nombre;
            document.getElementById('cat-categoria').value = data.categoria || '';
            document.getElementById('cat-desc').value = data.desc || '';
            document.getElementById('cat-precio').value = data.precio || '';
            document.getElementById('cat-stock').value = data.stock !== null && data.stock !== undefined ? data.stock : '';
            
            document.getElementById('modal-catalogo-title').innerText = 'Editar Artículo';
            document.getElementById('modal-catalogo').classList.remove('hidden');
        }
    } catch (error) { alert("Error al obtener datos: " + error.message); }
};

// ================= CROSS-POST TV =================
async function checkAndSendToTV(checkboxId, collectionName, docId, newImageUrl, newTipoMedia) {
    const cb = document.getElementById(checkboxId);
    if(cb && cb.checked) {
        let finalUrl = newImageUrl;
        let finalTipo = newTipoMedia;
        if (!finalUrl && docId) {
            const doc = await db.collection(collectionName).doc(docId).get();
            if (doc.exists) {
                finalUrl = doc.data().imagen;
                finalTipo = doc.data().tipo_media || 'imagen';
            }
        }
        if (finalUrl) {
            await db.collection("tv_cartelera").add({
                url: finalUrl,
                tipo: finalTipo || 'imagen',
                duracion: 10,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
            console.log("Enviado a TV:", finalUrl);
            if(window.cargarTV) cargarTV();
        }
    }
}

// ================= PANTALLA TV =================
const formTV = document.getElementById('form-tv');

if(document.getElementById('tv-tipo')) {
    document.getElementById('tv-tipo').addEventListener('change', (e) => {
        const isVideo = e.target.value === 'video';
        document.getElementById('tv-file').accept = isVideo ? 'video/*' : 'image/*';
        document.getElementById('tv-duracion-container').style.display = isVideo ? 'none' : 'block';
    });
}

if(formTV) {
    formTV.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btn-save-tv');
        const fileInput = document.getElementById('tv-file');
        const tipo = document.getElementById('tv-tipo').value;
        const duracion = document.getElementById('tv-duracion').value;

        try {
            btn.innerText = 'Subiendo a Cloudinary...';
            btn.disabled = true;

            if (fileInput.files.length === 0) throw new Error("Selecciona un archivo");
            const file = fileInput.files[0];

            // Cloudinary upload (siempre para mantener calidad 4K)
            const formData = new FormData();
            formData.append('file', file);
            formData.append('upload_preset', 'videos_tv'); 
            
            const cloudName = 'dab6vcwfv';
            const resourceType = tipo === 'video' ? 'video' : 'image';
            const url = `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`;

            const uploadRes = await fetch(url, {
                method: 'POST',
                body: formData
            });

            if (!uploadRes.ok) {
                const errData = await uploadRes.json();
                throw new Error(errData.error?.message || 'Error en Cloudinary');
            }

            const cloudinaryData = await uploadRes.json();
            const secureUrl = cloudinaryData.secure_url;

            btn.innerText = 'Guardando en Firebase...';

            await db.collection("tv_cartelera").add({
                url: secureUrl,
                tipo: tipo,
                duracion: Number(duracion) || 10,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            fileInput.value = '';
            window.closeModal('tv');
            cargarTV();
        } catch (error) {
            alert("Error: " + error.message);
        } finally {
            btn.innerText = 'Enviar a TV';
            btn.disabled = false;
        }
    });
}

async function cargarTV() {
    const list = document.getElementById('tv-list');
    if (!list) return;
    list.innerHTML = '<div class="col-span-full text-center text-gray-400">Cargando...</div>';
    
    try {
        const querySnapshot = await db.collection("tv_cartelera").orderBy("timestamp", "asc").get();
        list.innerHTML = '';
        
        if(querySnapshot.empty) {
            list.innerHTML = '<div class="col-span-full text-center text-gray-500 py-10">La cartelera está vacía.</div>';
            return;
        }

        let html = '';
        const docs = querySnapshot.docs;
        docs.forEach((docSnap, index) => {
            const p = docSnap.data();
            const id = docSnap.id;
            
            // Botones de orden
            let btnLeft = index > 0 ? `<button onclick="moverItemTV('${id}', -1)" class="w-8 h-8 bg-gray-700 hover:bg-gray-600 rounded flex items-center justify-center transition-colors text-white" title="Mover Izquierda"><i data-lucide="chevron-left" class="w-4 h-4"></i></button>` : `<div class="w-8 h-8"></div>`;
            let btnRight = index < docs.length - 1 ? `<button onclick="moverItemTV('${id}', 1)" class="w-8 h-8 bg-gray-700 hover:bg-gray-600 rounded flex items-center justify-center transition-colors text-white" title="Mover Derecha"><i data-lucide="chevron-right" class="w-4 h-4"></i></button>` : `<div class="w-8 h-8"></div>`;

            html += `
                <div class="bg-gray-900 border border-green-800 rounded-xl overflow-hidden relative group">
                    <div class="h-32 bg-gray-800 flex items-center justify-center overflow-hidden relative">
                        ${p.tipo === 'video' ? `<video src="${escapeHTML(p.url)}" muted class="w-full h-full object-cover"></video>` : `<img src="${escapeHTML(p.url)}" class="w-full h-full object-cover">`}
                        
                        <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                            ${btnLeft}
                            ${btnRight}
                        </div>
                    </div>
                    <div class="p-3 flex justify-between items-center">
                        <span class="text-xs text-gray-400 font-bold uppercase"><span class="text-green-500">#${index + 1}</span> - ${p.tipo}</span>
                        <button onclick="eliminarDoc('tv_cartelera', '${id}')" class="w-8 h-8 bg-red-900/50 hover:bg-red-800 text-red-400 rounded flex items-center justify-center transition-colors"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                    </div>
                </div>
            `;
        });
        list.innerHTML = html;
        if(window.lucide) lucide.createIcons();
    } catch (error) {
        console.error("Error cargando tv:", error);
        list.innerHTML = '<div class="col-span-full text-center text-red-500">Error al cargar.</div>';
    }
}

async function moverItemTV(currentId, dir) {
    try {
        const querySnapshot = await db.collection("tv_cartelera").orderBy("timestamp", "asc").get();
        const docs = querySnapshot.docs;
        const currentIndex = docs.findIndex(d => d.id === currentId);
        
        if (currentIndex === -1) return;
        
        const targetIndex = currentIndex + dir;
        if (targetIndex < 0 || targetIndex >= docs.length) return; // Fuera de limites
        
        const currentDoc = docs[currentIndex];
        const targetDoc = docs[targetIndex];
        
        const time1 = currentDoc.data().timestamp;
        const time2 = targetDoc.data().timestamp;
        
        // Intercambiar timestamps
        if (time1 && time2) {
            await db.collection("tv_cartelera").doc(currentDoc.id).update({ timestamp: time2 });
            await db.collection("tv_cartelera").doc(targetDoc.id).update({ timestamp: time1 });
            cargarTV(); // Recargar UI
        }
    } catch (e) {
        alert("Error al mover: " + e.message);
    }
}

