// MAKE SURE YOU REPLACE THESE WITH YOUR ACTUAL SUPABASE KEYS
const SUPABASE_URL = 'https://vjdqfgjbibocgorruhfj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_IX8R_VHKZ5pBLokFhl1lxA_JC2ya20s';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUserProfile = null;

// DOM Elements
const authSection = document.getElementById('auth-section');
const dashSection = document.getElementById('dashboard-section');
const adminPanel = document.getElementById('admin-panel');
const logoutBtn = document.getElementById('logout-btn');
const movementTypeSelect = document.getElementById('movement_type');
const donationFields = document.getElementById('donation-fields');
const loginBtn = document.getElementById('login-submit-btn');

// Network Status
window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);
function updateOnlineStatus() {
    const statusSpan = document.getElementById('sync-status');
    if (navigator.onLine) {
        statusSpan.textContent = 'Online';
        statusSpan.className = 'text-xs bg-green-700/60 px-2 py-1 rounded text-emerald-100';
        syncOfflineQueue();
    } else {
        statusSpan.textContent = 'Offline (Local)';
        statusSpan.className = 'text-xs bg-red-600 px-2 py-1 rounded text-white';
    }
}

// Auth State Listener
supabase.auth.onAuthStateChange(async (event, session) => {
    if (session) {
        try {
            // Fetch User Profile to get Name and Role
            const { data, error } = await supabase.from('user_profiles').select('*').eq('id', session.user.id).single();
            
            if (error) throw error;
            if (!data) throw new Error("Profile not found in database. Check SQL Setup.");

            currentUserProfile = data;
            
            authSection.classList.add('hidden');
            dashSection.classList.remove('hidden');
            logoutBtn.classList.remove('hidden');
            
            document.getElementById('user-display-role').textContent = `Logged in: ${data.current_staff_name} (${data.role})`;

            // Show Admin Panel if Admin
            if (data.role === 'admin') {
                adminPanel.classList.remove('hidden');
                loadAdminUsersTable();
            }

            initializeApp();
        } catch (err) {
            console.error(err);
            alert(`Setup Error: ${err.message}`);
            // Log out if profile fails to load to prevent freeze
            supabase.auth.signOut();
        }
    } else {
        authSection.classList.remove('hidden');
        dashSection.classList.add('hidden');
        logoutBtn.classList.add('hidden');
        adminPanel.classList.add('hidden');
        currentUserProfile = null;
    }
});

// Login Submission
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    
    loginBtn.textContent = 'Logging in...';
    loginBtn.disabled = true;

    try {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
            alert("Login failed: " + error.message);
            loginBtn.textContent = 'Sign In';
            loginBtn.disabled = false;
        }
    } catch (err) {
        alert("System error: Make sure you added your Supabase URL & Key in app.js.");
        loginBtn.textContent = 'Sign In';
        loginBtn.disabled = false;
    }
});

logoutBtn.addEventListener('click', async () => {
    await supabase.auth.signOut();
    loginBtn.textContent = 'Sign In';
    loginBtn.disabled = false;
});

// Init Data
async function initializeApp() {
    await loadDropdowns();
    await loadStockBalances();
}

movementTypeSelect.addEventListener('change', (e) => {
    if (e.target.value === 'Donation') {
        donationFields.classList.remove('hidden');
        document.getElementById('direction').value = 'In';
    } else {
        donationFields.classList.add('hidden');
    }
});

async function loadDropdowns() {
    try {
        const [{ data: items }, { data: depts }, { data: donors }] = await Promise.all([
            supabase.from('items').select('*'), supabase.from('departments').select('*'), supabase.from('donors').select('*')
        ]);
        
        document.getElementById('item_id').innerHTML = '<option value="">Select...</option>' + 
            (items || []).map(i => `<option value="${i.id}">${i.name} (${i.unit})</option>`).join('');
        document.getElementById('department_id').innerHTML = '<option value="">Select...</option>' + 
            (depts || []).map(d => `<option value="${d.id}">${d.name}</option>`).join('');
        document.getElementById('donor_id').innerHTML = '<option value="">Select...</option>' + 
            (donors || []).map(d => `<option value="${d.id}">${d.name}</option>`).join('');
    } catch (e) { 
        console.error("Offline mode active or data fetch failed.", e); 
    }
}

async function loadStockBalances() {
    const tbody = document.getElementById('balances-table-body');
    const { data, error } = await supabase.from('current_stock_balances').select('*');
    
    if (error) return tbody.innerHTML = `<tr><td colspan="4" class="text-center text-red-500 p-4">Error loading data</td></tr>`;
    if (!data || !data.length) return tbody.innerHTML = `<tr><td colspan="4" class="text-center text-gray-500 p-4">No records found.</td></tr>`;

    const { data: itemsData } = await supabase.from('items').select('name, reorder_level');

    tbody.innerHTML = data.map(row => {
        const itemMaster = itemsData?.find(i => i.name === row.item_name);
        const isLow = row.balance <= (itemMaster ? itemMaster.reorder_level : 0);

        return `
        <tr class="hover:bg-gray-50">
            <td class="p-2.5 font-medium">${row.item_name}</td>
            <td class="p-2.5 text-gray-600 text-xs">${row.department_name}</td>
            <td class="p-2.5 font-bold ${isLow ? 'text-red-600' : 'text-[#0b3b2c]'}">${row.balance} <span class="text-xs font-normal text-gray-500">${row.unit}</span></td>
            <td class="p-2.5">${isLow ? '<span class="bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs">Restock Needed</span>' : '<span class="text-green-600 text-xs">Healthy</span>'}</td>
        </tr>`;
    }).join('');
}

// Record Movement with Staff Name Attached
document.getElementById('movement-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const isDonation = document.getElementById('movement_type').value === 'Donation';
    
    const payload = {
        movement_type: document.getElementById('movement_type').value,
        item_id: document.getElementById('item_id').value,
        department_id: document.getElementById('department_id').value,
        direction: document.getElementById('direction').value,
        quantity: parseFloat(document.getElementById('quantity').value),
        reason: document.getElementById('reason').value,
        performed_by_name: currentUserProfile ? `${currentUserProfile.current_staff_name} (${currentUserProfile.role})` : 'Offline User',
        donor_id: isDonation ? document.getElementById('donor_id').value || null : null,
        donation_ref: isDonation ? document.getElementById('donation_ref').value : null,
        item_condition: isDonation ? document.getElementById('item_condition').value : null
    };

    if (!navigator.onLine) {
        let queue = JSON.parse(localStorage.getItem('offline_queue') || '[]');
        queue.push(payload);
        localStorage.setItem('offline_queue', JSON.stringify(queue));
        alert('Offline: Saved locally.');
        e.target.reset();
        return;
    }

    const { error } = await supabase.from('stock_movements').insert([payload]);
    if (error) alert("Error saving: " + error.message);
    else {
        alert('Saved!');
        e.target.reset();
        donationFields.classList.add('hidden');
        loadStockBalances();
    }
});

function syncOfflineQueue() {
    let queue = JSON.parse(localStorage.getItem('offline_queue') || '[]');
    if (!queue.length) return;
    supabase.from('stock_movements').insert(queue).then(({ error }) => {
        if (!error) {
            localStorage.removeItem('offline_queue');
            loadStockBalances();
        }
    });
}

// ADMIN FUNCTIONALITY
async function loadAdminUsersTable() {
    const { data } = await supabase.from('user_profiles').select('*');
    const tbody = document.getElementById('admin-users-table');
    
    if (!data) return;
    
    tbody.innerHTML = data.map(user => `
        <tr>
            <td class="p-2 text-xs">${user.generic_email || 'Unknown'}</td>
            <td class="p-2 text-xs font-semibold text-[#e85d04] uppercase">${user.role}</td>
            <td class="p-2 text-xs">
                <input type="text" id="staff-name-${user.id}" value="${user.current_staff_name}" class="border rounded p-1 w-full">
            </td>
            <td class="p-2 text-xs">
                <button onclick="updateStaffName('${user.id}')" class="bg-[#0b3b2c] text-white px-2 py-1 rounded">Update</button>
            </td>
        </tr>
    `).join('');
}

window.updateStaffName = async function(userId) {
    const newName = document.getElementById(`staff-name-${userId}`).value;
    const { error } = await supabase.from('user_profiles').update({ current_staff_name: newName }).eq('id', userId);
    if (error) alert("Error updating name: " + error.message);
    else alert("Staff assignment updated successfully!");
};
