// YOUR NEW SUPABASE CREDENTIALS
const SUPABASE_URL = 'https://sfrgoujuwmctssszndrs.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_zm8UZ9x6LlQwr-UdCziZ0g_7DbJvBbq';

document.addEventListener('DOMContentLoaded', () => {
    
    if (!window.supabase) {
        alert("CRITICAL ERROR: Supabase library did not load. Check internet.");
        return;
    }

    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    let currentUserProfile = null;

    const authSection = document.getElementById('auth-section');
    const dashSection = document.getElementById('dashboard-section');
    const adminPanel = document.getElementById('admin-panel');
    const logoutBtn = document.getElementById('logout-btn');
    const loginForm = document.getElementById('login-form');
    const loginBtn = document.getElementById('login-submit-btn');

    // Network tracking
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

    // Session Management
    supabase.auth.onAuthStateChange(async (event, session) => {
        if (session) {
            try {
                const { data, error } = await supabase.from('user_profiles').select('*').eq('id', session.user.id).single();
                if (error) throw new Error(error.message);
                if (!data) throw new Error("User profile missing. Inform Admin.");

                currentUserProfile = data;
                authSection.classList.add('hidden');
                dashSection.classList.remove('hidden');
                logoutBtn.classList.remove('hidden');
                
                document.getElementById('user-display-role').textContent = `Logged in: ${data.current_staff_name} (${data.role})`;

                if (data.role === 'admin') {
                    adminPanel.classList.remove('hidden');
                    loadAdminUsersTable();
                }

                initializeApp();
            } catch (err) {
                console.error(err);
                alert("Login Error: " + err.message);
                supabase.auth.signOut();
                
                // FIX: This unfreezes the button if the profile fails to load
                loginBtn.textContent = 'Enter Workspace';
                loginBtn.disabled = false;
            }
        } else {
            authSection.classList.remove('hidden');
            dashSection.classList.add('hidden');
            logoutBtn.classList.add('hidden');
            adminPanel.classList.add('hidden');
            currentUserProfile = null;
        }
    });

    // Login Form - Secretly translates Workspace Dropdown into an email
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const username = document.getElementById('auth-username').value; 
        const password = document.getElementById('auth-password').value;
        
        if (!username) {
            alert("Please select a workspace.");
            return;
        }

        const dummyEmail = `${username}@amyshouse.local`;
        
        loginBtn.textContent = 'Opening Workspace...';
        loginBtn.disabled = true;

        try {
            const { error } = await supabase.auth.signInWithPassword({ email: dummyEmail, password: password });
            
            if (error) {
                alert("Access Denied: Incorrect Password.");
                loginBtn.textContent = 'Enter Workspace';
                loginBtn.disabled = false;
            }
            // If successful, onAuthStateChange takes over automatically
        } catch (err) {
            alert("Connection Error. Please try again.");
            loginBtn.textContent = 'Enter Workspace';
            loginBtn.disabled = false;
        }
    });

    logoutBtn.addEventListener('click', async () => {
        await supabase.auth.signOut();
        loginBtn.textContent = 'Enter Workspace';
        loginBtn.disabled = false;
    });

    async function initializeApp() {
        await loadDropdowns();
        await loadStockBalances();
    }

    document.getElementById('movement_type').addEventListener('change', (e) => {
        const donationFields = document.getElementById('donation-fields');
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
        } catch (e) { console.warn("Dropdown load failed"); }
    }

    async function loadStockBalances() {
        const tbody = document.getElementById('balances-table-body');
        const { data, error } = await supabase.from('current_stock_balances').select('*');
        
        if (error) return tbody.innerHTML = `<tr><td colspan="4" class="text-center text-red-500 p-4">Error: ${error.message}</td></tr>`;
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

    document.getElementById('movement-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const isDonation = document.getEle
