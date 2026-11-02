// SUPABASE CLIENT INITIALIZATION
const SUPABASE_URL = 'https://sfrgoujuwmctssszndrs.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_zm8UZ9x6LlQwr-UdCziZ0g_7DbJvBbq';

document.addEventListener('DOMContentLoaded', async () => {
    
    // Register Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(err => console.log("SW Reg Error:", err));
    }

    if (!window.supabase) {
        showError("CRITICAL: Supabase library failed to load. Check internet.");
        return;
    }

    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // DOM Elements
    const authSection = document.getElementById('auth-section');
    const dashSection = document.getElementById('dashboard-section');
    const logoutBtn = document.getElementById('logout-btn');
    const loginForm = document.getElementById('login-form');
    const loginBtn = document.getElementById('login-submit-btn');
    const errorBox = document.getElementById('login-error-box');

    function showError(msg) {
        errorBox.textContent = msg;
        errorBox.style.display = 'block';
    }

    function clearError() {
        errorBox.textContent = '';
        errorBox.style.display = 'none';
    }

    // Check if session exists on load
    const { data: { session } } = await supabase.auth.getSession();
    const savedStaffName = sessionStorage.getItem('staff_name');
    const savedDeptCode = sessionStorage.getItem('dept_code');

    if (session && savedStaffName && savedDeptCode) {
        showDashboard(savedStaffName, savedDeptCode);
    }

    // Login Form Submit using Department Codes
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearError();

        const deptCode = document.getElementById('auth-dept-code').value.toUpperCase().trim();
        const staffName = document.getElementById('auth-staff-name').value.trim();
        const password = document.getElementById('auth-password').value;

        if (!deptCode || !staffName) {
            showError("Please enter your Department Code and Name.");
            return;
        }

        // Silent translation from Department Code to internal credential
        const internalEmail = `${deptCode.toLowerCase()}@amyshouse.org`;

        loginBtn.textContent = 'Verifying Code...';
        loginBtn.disabled = true;

        try {
            const { error } = await supabase.auth.signInWithPassword({
                email: internalEmail,
                password: password
            });

            if (error) throw new Error("Invalid Department Code or Password.");

            // Store current operator details
            sessionStorage.setItem('staff_name', staffName);
            sessionStorage.setItem('dept_code', deptCode);

            showDashboard(staffName, deptCode);

        } catch (err) {
            showError(err.message);
            loginBtn.textContent = 'Access Department';
            loginBtn.disabled = false;
        }
    });

    // Central UI Switch
    function showDashboard(staffName, deptCode) {
        authSection.style.setProperty('display', 'none', 'important');
        dashSection.style.setProperty('display', 'grid', 'important');
        logoutBtn.style.setProperty('display', 'inline-block', 'important');

        document.getElementById('user-display-role').textContent = `Operator: ${staffName} [${deptCode}]`;

        initializeApp();
    }

    // Logout
    logoutBtn.addEventListener('click', async () => {
        await supabase.auth.signOut();
        sessionStorage.clear();
        window.location.reload();
    });

    // Master Data Loaders
    async function initializeApp() {
        await loadDropdowns();
        await loadStockBalances();
    }

    document.getElementById('movement_type').addEventListener('change', (e) => {
        const donationFields = document.getElementById('donation-fields');
        if (e.target.value === 'Donation') {
            donationFields.style.display = 'block';
            document.getElementById('direction').value = 'In';
        } else {
            donationFields.style.display = 'none';
        }
    });

    async function loadDropdowns() {
        try {
            const [{ data: items }, { data: depts }, { data: donors }] = await Promise.all([
                supabase.from('items').select('*').order('name'),
                supabase.from('departments').select('*').order('name'),
                supabase.from('donors').select('*').order('name')
            ]);

            document.getElementById('item_id').innerHTML = '<option value="">Select Item...</option>' + 
                (items || []).map(i => `<option value="${i.id}">${i.name} (${i.unit})</option>`).join('');

            document.getElementById('department_id').innerHTML = '<option value="">Select Department...</option>' + 
                (depts || []).map(d => `<option value="${d.id}">${d.name} (${d.dept_code})</option>`).join('');

            document.getElementById('donor_id').innerHTML = '<option value="">Select Donor...</option>' + 
                (donors || []).map(d => `<option value="${d.id}">${d.name}</option>`).join('');

        } catch (e) {
            console.warn("Dropdown load issue:", e);
        }
    }

    async function loadStockBalances() {
        const tbody = document.getElementById('balances-table-body');
        const { data, error } = await supabase.from('current_stock_balances').select('*');

        if (error) {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center text-red-500 p-4">Error loading stock: ${error.message}</td></tr>`;
            return;
        }

        if (!data || !data.length) {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center text-gray-500 p-4">No stock movements recorded yet.</td></tr>`;
            return;
        }

        const { data: itemsData } = await supabase.from('items').select('name, reorder_level');

        tbody.innerHTML = data.map(row => {
            const itemMaster = itemsData?.find(i => i.name === row.item_name);
            const isLow = row.balance <= (itemMaster ? itemMaster.reorder_level : 0);

            return `
            <tr class="hover:bg-gray-50">
                <td class="p-2.5 font-medium">${row.item_name}</td>
                <td class="p-2.5 text-gray-600 text-xs">${row.department_name}</td>
                <td class="p-2.5 font-bold ${isLow ? 'text-red-600' : 'text-[#0b3b2c]'}">${row.balance} <span class="text-xs font-normal text-gray-500">${row.unit}</span></td>
                <td class="p-2.5">${isLow ? '<span class="bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs font-semibold">Low Stock</span>' : '<span class="text-green-600 text-xs">Healthy</span>'}</td>
            </tr>`;
        }).join('');
    }

    // Submit Movement Entry
    document.getElementById('movement-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const isDonation = document.getElementById('movement_type').value === 'Donation';
        
        const staffName = sessionStorage.getItem('staff_name') || 'Staff';
        const deptCode = sessionStorage.getItem('dept_code') || 'STORE';

        const payload = {
            movement_type: document.getElementById('movement_type').value,
            item_id: document.getElementById('item_id').value,
            department_id: document.getElementById('department_id').value,
            direction: document.getElementById('direction').value,
            quantity: parseFloat(document.getElementById('quantity').value),
            reason: document.getElementById('reason').value,
            performed_by_name: `${staffName} (${deptCode})`,
            donor_id: isDonation ? document.getElementById('donor_id').value || null : null,
            donation_ref: isDonation ? document.getElementById('donation_ref').value : null,
            item_condition: isDonation ? document.getElementById('item_condition').value : null
        };

        const { error } = await supabase.from('stock_movements').insert([payload]);

        if (error) {
            alert("Error saving: " + error.message);
        } else {
            alert('Movement Saved Successfully!');
            e.target.reset();
            document.getElementById('donation-fields').style.display = 'none';
            loadStockBalances();
        }
    });

    // Connection Listeners
    window.addEventListener('online', () => document.getElementById('sync-status').textContent = 'Online');
    window.addEventListener('offline', () => document.getElementById('sync-status').textContent = 'Offline (Local)');
});
