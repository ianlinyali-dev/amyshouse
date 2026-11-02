// ==============================================================================
// MSCP AMY'S HOUSE INVENTORY SYSTEM - JAVASCRIPT CONTROLLER
// ==============================================================================

const SUPABASE_URL = 'https://sfrgoujuwmctssszndrs.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_zm8UZ9x6LlQwr-UdCziZ0g_7DbJvBbq';

document.addEventListener('DOMContentLoaded', async () => {

    // Register Service Worker for offline capability
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW Registration:', err));
    }

    if (!window.supabase) {
        alert('Critical error: Supabase CDN could not be loaded. Check internet connection.');
        return;
    }

    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // Global in-memory data cache
    let cachedItems = [];
    let cachedDepts = [];
    let cachedDonors = [];
    let currentUserDeptCode = '';
    let currentUserName = '';

    // DOM Elements
    const authSection = document.getElementById('auth-section');
    const dashSection = document.getElementById('dashboard-section');
    const appNavTabs = document.getElementById('app-nav-tabs');
    const logoutBtn = document.getElementById('logout-btn');
    const loginForm = document.getElementById('login-form');
    const errorBox = document.getElementById('login-error-box');

    // --------------------------------------------------------------------------
    // 1. AUTHENTICATION & SESSION HANDLING
    // --------------------------------------------------------------------------
    const { data: { session } } = await supabase.auth.getSession();
    const savedStaffName = sessionStorage.getItem('staff_name');
    const savedDeptCode = sessionStorage.getItem('dept_code');

    if (session && savedStaffName && savedDeptCode) {
        currentUserName = savedStaffName;
        currentUserDeptCode = savedDeptCode;
        initDashboard();
    }

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorBox.style.display = 'none';

        const deptCode = document.getElementById('auth-dept-code').value.toUpperCase().trim();
        const staffName = document.getElementById('auth-staff-name').value.trim();
        const password = document.getElementById('auth-password').value;

        if (!deptCode || !staffName) {
            errorBox.textContent = 'Please choose a department and input your name.';
            errorBox.style.display = 'block';
            return;
        }

        // Resolves to format: ad001@amyshouse.org
        const email = `${deptCode.toLowerCase()}@amyshouse.org`;
        const submitBtn = document.getElementById('login-submit-btn');
        submitBtn.textContent = 'Verifying...';
        submitBtn.disabled = true;

        try {
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) throw new Error('Invalid Department PIN or credentials: ' + error.message);

            sessionStorage.setItem('staff_name', staffName);
            sessionStorage.setItem('dept_code', deptCode);
            currentUserName = staffName;
            currentUserDeptCode = deptCode;

            initDashboard();
        } catch (err) {
            errorBox.textContent = err.message;
            errorBox.style.display = 'block';
            submitBtn.textContent = 'Unlock System';
            submitBtn.disabled = false;
        }
    });

    logoutBtn.addEventListener('click', async () => {
        await supabase.auth.signOut();
        sessionStorage.clear();
        window.location.reload();
    });

    function initDashboard() {
        authSection.style.display = 'none';
        dashSection.style.display = 'block';
        appNavTabs.style.display = 'block';
        logoutBtn.style.display = 'inline-block';

        const roleTitle = currentUserDeptCode === 'AD001' 
            ? 'Executive Admin (Dorothy)' 
            : currentUserDeptCode === 'ST001' 
            ? 'Central Storekeeper' 
            : `Department Operator [${currentUserDeptCode}]`;

        document.getElementById('user-display-role').textContent = `${currentUserName} · ${roleTitle}`;

        setupTabNavigation();
        loadMasterMetadata();
        refreshAllViews();
    }

    // --------------------------------------------------------------------------
    // 2. TAB NAVIGATION
    // --------------------------------------------------------------------------
    function setupTabNavigation() {
        const tabs = document.querySelectorAll('.tab-btn');
        tabs.forEach(btn => {
            btn.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('bg-emerald-900', 'text-white'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));

                btn.classList.add('bg-emerald-900', 'text-white');
                const targetId = btn.getAttribute('data-tab');
                document.getElementById(targetId).classList.remove('hidden');

                // Refresh specific tables on switch
                if (targetId === 'tab-stock') loadStockBalances();
                if (targetId === 'tab-ledger') loadLedgerRecords();
                if (targetId === 'tab-donations') loadDonationRegister();
                if (targetId === 'tab-assets') loadAssets();
                if (targetId === 'tab-replenishment') loadReplenishmentList();
            });
        });
    }

    // --------------------------------------------------------------------------
    // 3. MASTER DATA LOADERS & MODALS
    // --------------------------------------------------------------------------
    async function loadMasterMetadata() {
        try {
            const [{ data: items }, { data: depts }, { data: donors }] = await Promise.all([
                supabase.from('items').select('*').order('name'),
                supabase.from('departments').select('*').order('name'),
                supabase.from('donors').select('*').order('name')
            ]);

            cachedItems = items || [];
            cachedDepts = depts || [];
            cachedDonors = donors || [];

            populateDropdowns();
        } catch (err) {
            console.error('Metadata load error:', err);
        }
    }

    function populateDropdowns() {
        // Items Dropdown
        const itemSelect = document.getElementById('item_id');
        itemSelect.innerHTML = '<option value="">Select Item...</option>' + 
            cachedItems.map(i => `<option value="${i.id}">${i.name} (${i.unit})${i.is_perishable ? ' [Perishable]' : ''}</option>`).join('');

        // Department Dropdowns
        const deptSelect = document.getElementById('department_id');
        const assetDeptSelect = document.getElementById('asset_dept_id');
        const filterStockDept = document.getElementById('filter-stock-dept');

        const deptOptions = '<option value="">Select Department...</option>' + 
            cachedDepts.map(d => `<option value="${d.id}">${d.name} (${d.dept_code})</option>`).join('');

        deptSelect.innerHTML = deptOptions;
        assetDeptSelect.innerHTML = deptOptions;

        // Populate stock filter
        filterStockDept.innerHTML = '<option value="ALL">All Departments</option>' + 
            cachedDepts.map(d => `<option value="${d.dept_code}">${d.name}</option>`).join('');

        // Donors Dropdown
        const donorSelect = document.getElementById('donor_id');
        donorSelect.innerHTML = '<option value="">Select Donor...</option>' + 
            cachedDonors.map(dn => `<option value="${dn.id}">${dn.name}</option>`).join('');
    }

    // Modal Triggers
    document.getElementById('btn-open-new-item-modal').addEventListener('click', () => {
        document.getElementById('modal-new-item').classList.remove('hidden');
    });

    document.getElementById('btn-open-new-donor-modal').addEventListener('click', () => {
        document.getElementById('modal-new-donor').classList.remove('hidden');
    });

    document.getElementById('btn-open-asset-modal').addEventListener('click', () => {
        document.getElementById('modal-new-asset').classList.remove('hidden');
    });

    // Create New Item Form Handler
    document.getElementById('form-create-item').addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            name: document.getElementById('new_item_name').value.trim(),
            unit: document.getElementById('new_item_unit').value.trim(),
            category: document.getElementById('new_item_category').value,
            reorder_level: parseFloat(document.getElementById('new_item_reorder').value) || 5,
            standard_cost: parseFloat(document.getElementById('new_item_cost').value) || 0,
            is_perishable: document.getElementById('new_item_perishable').checked
        };

        const { data, error } = await supabase.from('items').insert([payload]).select().single();
        if (error) {
            alert('Error adding item: ' + error.message);
        } else {
            alert(`Item "${payload.name}" successfully created!`);
            document.getElementById('form-create-item').reset();
            document.getElementById('modal-new-item').classList.add('hidden');
            await loadMasterMetadata();
            document.getElementById('item_id').value = data.id;
        }
    });

    // Create New Donor Form Handler
    document.getElementById('form-create-donor').addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            name: document.getElementById('new_donor_name').value.trim(),
            contact_info: document.getElementById('new_donor_contact').value.trim()
        };

        const { data, error } = await supabase.from('donors').insert([payload]).select().single();
        if (error) {
            alert('Error adding donor: ' + error.message);
        } else {
            alert(`Donor "${payload.name}" registered!`);
            document.getElementById('form-create-donor').reset();
            document.getElementById('modal-new-donor').classList.add('hidden');
            await loadMasterMetadata();
            document.getElementById('donor_id').value = data.id;
        }
    });

    // Movement Form Dynamic Changes
    document.getElementById('movement_type').addEventListener('change', (e) => {
        const val = e.target.value;
        const donationFields = document.getElementById('donation-fields');
        const directionSelect = document.getElementById('direction');

        if (val.startsWith('Donation')) {
            donationFields.style.display = 'block';
            directionSelect.value = 'In';
        } else {
            donationFields.style.display = 'none';
        }

        if (['Purchase', 'Farm Produce'].includes(val)) {
            directionSelect.value = 'In';
        } else if (['Weekly Supply', 'Top-up', 'Issue to Department', 'Spoilage or Loss'].includes(val)) {
            directionSelect.value = 'Out';
        }
    });

    // --------------------------------------------------------------------------
    // 4. RECORD STOCK MOVEMENT SUBMIT
    // --------------------------------------------------------------------------
    document.getElementById('movement-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const moveType = document.getElementById('movement_type').value;
        const isDonation = moveType.startsWith('Donation');
        const itemId = document.getElementById('item_id').value;
        const deptId = document.getElementById('department_id').value;
        const direction = document.getElementById('direction').value;
        const quantity = parseFloat(document.getElementById('quantity').value);
        const unitPrice = parseFloat(document.getElementById('unit_price').value) || 0;
        const totalCost = unitPrice * quantity;

        // Prevent Negative Balance Check on Out Movements
        if (direction === 'Out') {
            const { data: balanceCheck } = await supabase
                .from('current_stock_balances')
                .select('balance')
                .eq('item_id', itemId)
                .eq('department_id', deptId)
                .single();

            const currentAvailable = balanceCheck ? balanceCheck.balance : 0;
            if (quantity > currentAvailable) {
                if (!confirm(`Warning: Only ${currentAvailable} in stock for this department. Record anyway as an authorized adjustment?`)) {
                    return;
                }
            }
        }

        const payload = {
            item_id: itemId,
            department_id: deptId,
            movement_type: moveType,
            direction: direction,
            quantity: quantity,
            unit_price: unitPrice,
            total_cost: totalCost,
            reason_category: document.getElementById('reason_category').value || null,
            people_count: parseInt(document.getElementById('people_count').value) || null,
            reason: document.getElementById('reason').value || null,
            expiry_date: document.getElementById('expiry_date').value || null,
            performed_by_name: `${currentUserName} (${currentUserDeptCode})`,

            // Donation Specifics
            donor_id: isDonation ? document.getElementById('donor_id').value || null : null,
            donation_ref: isDonation ? document.getElementById('donation_ref').value || null : null,
            donor_intent: isDonation ? (moveType.includes('Amy') ? 'Unrestricted' : 'Department Specific') : null,
            item_condition: isDonation ? document.getElementById('item_condition').value || 'Good' : null
        };

        const saveBtn = document.getElementById('btn-save-movement');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving Movement...';

        try {
            const { error } = await supabase.from('stock_movements').insert([payload]);
            if (error) throw error;

            alert('Movement recorded successfully!');
            document.getElementById('movement-form').reset();
            document.getElementById('donation-fields').style.display = 'none';
            refreshAllViews();
        } catch (err) {
            alert('Error saving movement: ' + err.message);
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Confirm & Save Movement';
        }
    });

    // --------------------------------------------------------------------------
    // 5. ASSET REGISTER SUBMIT & VIEW
    // --------------------------------------------------------------------------
    document.getElementById('form-create-asset').addEventListener('submit', async (e) => {
        e.preventDefault();

        const payload = {
            item_name: document.getElementById('asset_name').value.trim(),
            department_id: document.getElementById('asset_dept_id').value,
            acquisition_type: document.getElementById('asset_acq_type').value,
            condition: document.getElementById('asset_condition').value,
            cost_or_value: parseFloat(document.getElementById('asset_cost').value) || 0,
            storage_location: document.getElementById('asset_location').value.trim(),
            custodian: document.getElementById('asset_custodian').value.trim(),
            tag_or_serial: document.getElementById('asset_tag').value.trim()
        };

        const { error } = await supabase.from('assets').insert([payload]);
        if (error) {
            alert('Error saving asset: ' + error.message);
        } else {
            alert('Durable asset recorded successfully!');
            document.getElementById('form-create-asset').reset();
            document.getElementById('modal-new-asset').classList.add('hidden');
            loadAssets();
        }
    });

    async function loadAssets() {
        const tbody = document.getElementById('assets-table-body');
        tbody.innerHTML = '<tr><td colspan="7" class="text-center p-4 text-gray-400">Loading assets...</td></tr>';

        let query = supabase.from('assets').select('*, departments(name, dept_code)').order('created_at', { ascending: false });

        // Scoped for department users
        if (currentUserDeptCode !== 'AD001' && currentUserDeptCode !== 'ST001') {
            const dept = cachedDepts.find(d => d.dept_code === currentUserDeptCode);
            if (dept) query = query.eq('department_id', dept.id);
        }

        const { data, error } = await query;
        if (error) {
            tbody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-red-500">Error: ${error.message}</td></tr>`;
            return;
        }

        if (!data || !data.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="p-6 text-center text-gray-400">No durable assets registered yet.</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(a => `
            <tr class="hover:bg-gray-50 border-b">
                <td class="p-2.5 font-bold text-[#0b3b2c]">${a.item_name}</td>
                <td class="p-2.5 text-xs text-gray-600">${a.departments?.name || 'Central'}</td>
                <td class="p-2.5"><span class="px-2 py-0.5 rounded text-xs bg-gray-100 font-medium">${a.acquisition_type}</span></td>
                <td class="p-2.5">
                    <span class="px-2 py-0.5 rounded text-xs font-semibold ${
                        a.condition === 'Good' ? 'bg-green-100 text-green-800' :
                        a.condition === 'Fair' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
                    }">${a.condition}</span>
                </td>
                <td class="p-2.5 text-xs">${a.storage_location}</td>
                <td class="p-2.5 text-xs font-medium">${a.custodian}</td>
                <td class="p-2.5 text-xs font-mono text-gray-500">${a.tag_or_serial || '—'}</td>
            </tr>
        `).join('');
    }

    // --------------------------------------------------------------------------
    // 6. LIVE STOCK BALANCES VIEW
    // --------------------------------------------------------------------------
    async function loadStockBalances() {
        const tbody = document.getElementById('balances-table-body');
        const filterDept = document.getElementById('filter-stock-dept').value;

        let query = supabase.from('current_stock_balances').select('*').order('item_name');

        if (filterDept !== 'ALL') {
            query = query.eq('dept_code', filterDept);
        } else if (currentUserDeptCode !== 'AD001' && currentUserDeptCode !== 'ST001') {
            query = query.eq('dept_code', currentUserDeptCode);
        }

        const { data, error } = await query;
        if (error) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center p-4 text-red-500">Error: ${error.message}</td></tr>`;
            return;
        }

        if (!data || !data.length) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center p-6 text-gray-400">No stock movements found.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.map(r => {
            const isLow = r.balance <= r.reorder_level;
            return `
                <tr class="hover:bg-gray-50 border-b">
                    <td class="p-3 font-semibold text-gray-900">${r.item_name}</td>
                    <td class="p-3 text-xs text-gray-500">${r.category}</td>
                    <td class="p-3 text-xs font-medium text-[#0b3b2c]">${r.department_name}</td>
                    <td class="p-3 font-mono font-bold text-sm ${isLow ? 'text-red-600' : 'text-[#0b3b2c]'}">
                        ${Number(r.balance).toFixed(2)} <span class="text-xs font-normal text-gray-500">${r.unit}</span>
                    </td>
                    <td class="p-3">
                        <span class="px-2 py-0.5 rounded text-xs font-semibold ${isLow ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}">
                            ${isLow ? '⚠️ Low Stock' : '✓ Healthy'}
                        </span>
                    </td>
                    <td class="p-3 text-right">
                        ${r.is_perishable ? '<span class="px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-900 font-semibold">Perishable</span>' : '<span class="text-gray-400 text-xs">—</span>'}
                    </td>
                </tr>
            `;
        }).join('');
    }

    document.getElementById('filter-stock-dept').addEventListener('change', loadStockBalances);

    // --------------------------------------------------------------------------
    // 7. MOVEMENT LEDGER & TOP-UP TRACKER
    // --------------------------------------------------------------------------
    async function loadLedgerRecords() {
        const tbody = document.getElementById('ledger-table-body');
        const typeFilter = document.getElementById('filter-ledger-type').value;

        let query = supabase.from('stock_movements')
            .select('*, items(name, unit), departments(name, dept_code)')
            .order('created_at', { ascending: false })
            .limit(100);

        if (typeFilter !== 'ALL') {
            query = query.eq('movement_type', typeFilter);
        }

        if (currentUserDeptCode !== 'AD001' && currentUserDeptCode !== 'ST001') {
            const dept = cachedDepts.find(d => d.dept_code === currentUserDeptCode);
            if (dept) query = query.eq('department_id', dept.id);
        }

        const { data, error } = await query;
        if (error) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center p-4 text-red-500">Error: ${error.message}</td></tr>`;
            return;
        }

        if (!data || !data.length) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center p-6 text-gray-400">No ledger entries match criteria.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.map(m => {
            const dateStr = new Date(m.created_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' });
            const isIn = m.direction === 'In';
            return `
                <tr class="hover:bg-gray-50 border-b">
                    <td class="p-2.5 text-gray-500 whitespace-nowrap">${dateStr}</td>
                    <td class="p-2.5">
                        <span class="px-2 py-0.5 rounded text-xs font-semibold ${
                            m.movement_type === 'Top-up' ? 'bg-orange-100 text-orange-800' :
                            isIn ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-800'
                        }">
                            ${m.movement_type}
                        </span>
                    </td>
                    <td class="p-2.5 font-bold">${m.items?.name || 'Item'}</td>
                    <td class="p-2.5 text-xs text-gray-600">${m.departments?.name || 'Central'}</td>
                    <td class="p-2.5 font-mono font-bold ${isIn ? 'text-green-700' : 'text-red-700'}">
                        ${isIn ? '+' : '-'}${m.quantity} ${m.items?.unit || ''}
                    </td>
                    <td class="p-2.5 text-xs text-gray-700">
                        ${m.reason_category ? `<strong>[${m.reason_category}]</strong> ` : ''}
                        ${m.reason || ''} 
                        ${m.people_count ? `(${m.people_count} people)` : ''}
                    </td>
                    <td class="p-2.5 text-xs text-gray-500">${m.performed_by_name}</td>
                </tr>
            `;
        }).join('');
    }

    document.getElementById('filter-ledger-type').addEventListener('change', loadLedgerRecords);

    // --------------------------------------------------------------------------
    // 8. DEDICATED DONATION REGISTER
    // --------------------------------------------------------------------------
    async function loadDonationRegister() {
        const tbody = document.getElementById('donations-table-body');
        const { data, error } = await supabase.from('donation_register_view').select('*').order('date_received', { ascending: false });

        if (error) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-center p-4 text-red-500">Error: ${error.message}</td></tr>`;
            return;
        }

        if (!data || !data.length) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-center p-6 text-gray-400">No donations registered yet.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.map(d => `
            <tr class="hover:bg-gray-50 border-b">
                <td class="p-2.5 font-mono font-bold text-orange-950">${d.donation_ref}</td>
                <td class="p-2.5 font-medium">${d.donor_name}</td>
                <td class="p-2.5">${d.item_name}</td>
                <td class="p-2.5 text-xs font-semibold ${d.donor_intent === 'Unrestricted' ? 'text-emerald-700' : 'text-blue-700'}">${d.donor_intent}</td>
                <td class="p-2.5"><span class="px-2 py-0.5 rounded text-xs bg-gray-100 font-medium">${d.item_condition || 'Good'}</span></td>
                <td class="p-2.5 font-mono text-green-700">${Number(d.total_received).toFixed(1)} ${d.unit}</td>
                <td class="p-2.5 font-mono text-red-700">${Number(d.total_used).toFixed(1)} ${d.unit}</td>
                <td class="p-2.5 font-mono font-bold text-[#0b3b2c]">${Number(d.remaining_balance).toFixed(1)} ${d.unit}</td>
            </tr>
        `).join('');
    }

    // --------------------------------------------------------------------------
    // 9. REPLENISHMENT & MARKET LIST VIEW
    // --------------------------------------------------------------------------
    async function loadReplenishmentList() {
        const tbody = document.getElementById('replenishment-table-body');
        const budgetElem = document.getElementById('total-market-budget');

        const { data, error } = await supabase.from('replenishment_needed_view').select('*');
        if (error) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center p-4 text-red-500">Error: ${error.message}</td></tr>`;
            return;
        }

        if (!data || !data.length) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center p-6 text-emerald-700 font-semibold">🎉 All items are adequately stocked! No replenishment needed right now.</td></tr>`;
            budgetElem.textContent = 'Estimated Budget: KES 0.00';
            return;
        }

        let totalEst = 0;
        tbody.innerHTML = data.map(r => {
            totalEst += Number(r.estimated_cost);
            return `
                <tr class="hover:bg-amber-50/50 border-b">
                    <td class="p-2.5 font-bold text-gray-900">${r.item_name}</td>
                    <td class="p-2.5 text-gray-500">${r.category}</td>
                    <td class="p-2.5 font-mono text-red-700 font-semibold">${Number(r.current_stock).toFixed(1)} ${r.unit}</td>
                    <td class="p-2.5 font-mono text-gray-600">${r.reorder_level} ${r.unit}</td>
                    <td class="p-2.5 font-mono font-black text-[#e85d04]">${Number(r.suggested_reorder_qty).toFixed(1)} ${r.unit}</td>
                    <td class="p-2.5 font-mono text-gray-700">KES ${Number(r.standard_cost).toFixed(2)}</td>
                    <td class="p-2.5 text-right font-mono font-bold text-[#0b3b2c]">KES ${Number(r.estimated_cost).toFixed(2)}</td>
                </tr>
            `;
        }).join('');

        budgetElem.textContent = `Estimated Budget: KES ${totalEst.toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;
    }

    function refreshAllViews() {
        loadStockBalances();
        loadLedgerRecords();
        loadDonationRegister();
        loadAssets();
        loadReplenishmentList();
    }

    // --------------------------------------------------------------------------
    // 10. EXPORT DATA TO CSV UTILITIES
    // --------------------------------------------------------------------------
    function downloadCSV(csvContent, fileName) {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    document.getElementById('btn-export-stock').addEventListener('click', async () => {
        const { data } = await supabase.from('current_stock_balances').select('*');
        if (!data || !data.length) return alert('No stock data to export.');

        let csv = 'Item Name,Category,Department,Balance,Unit,Reorder Level,Is Perishable\n';
        data.forEach(r => {
            csv += `"${r.item_name}","${r.category}","${r.department_name}",${r.balance},"${r.unit}",${r.reorder_level},${r.is_perishable}\n`;
        });
        downloadCSV(csv, `Amys_House_Stock_Balances_${new Date().toISOString().slice(0,10)}.csv`);
    });

    document.getElementById('btn-export-ledger').addEventListener('click', async () => {
        const { data } = await supabase.from('stock_movements').select('*, items(name, unit), departments(name)');
        if (!data || !data.length) return alert('No movements to export.');

        let csv = 'Date,Movement Type,Direction,Item,Unit,Quantity,Department,Reason,Operator\n';
        data.forEach(m => {
            csv += `"${m.created_at}","${m.movement_type}","${m.direction}","${m.items?.name}","${m.items?.unit}",${m.quantity},"${m.departments?.name}","${m.reason || ''}","${m.performed_by_name}"\n`;
        });
        downloadCSV(csv, `Amys_House_Movement_Ledger_${new Date().toISOString().slice(0,10)}.csv`);
    });

    document.getElementById('btn-export-donations').addEventListener('click', async () => {
        const { data } = await supabase.from('donation_register_view').select('*');
        if (!data || !data.length) return alert('No donations to export.');

        let csv = 'Ref No,Donor,Item,Intent,Condition,Total Received,Total Used,Remaining,Unit\n';
        data.forEach(d => {
            csv += `"${d.donation_ref}","${d.donor_name}","${d.item_name}","${d.donor_intent}","${d.item_condition}",${d.total_received},${d.total_used},${d.remaining_balance},"${d.unit}"\n`;
        });
        downloadCSV(csv, `Amys_House_Donation_Register_${new Date().toISOString().slice(0,10)}.csv`);
    });

    document.getElementById('btn-export-assets').addEventListener('click', async () => {
        const { data } = await supabase.from('assets').select('*, departments(name)');
        if (!data || !data.length) return alert('No assets to export.');

        let csv = 'Asset Name,Department,Acquisition,Condition,Cost Value,Location,Custodian,Tag Serial\n';
        data.forEach(a => {
            csv += `"${a.item_name}","${a.departments?.name}","${a.acquisition_type}","${a.condition}",${a.cost_or_value},"${a.storage_location}","${a.custodian}","${a.tag_or_serial || ''}"\n`;
        });
        downloadCSV(csv, `Amys_House_Assets_${new Date().toISOString().slice(0,10)}.csv`);
    });

    // --------------------------------------------------------------------------
    // 11. ONLINE / OFFLINE STATUS INDICATOR
    // --------------------------------------------------------------------------
    const syncStatus = document.getElementById('sync-status');
    window.addEventListener('online', () => {
        syncStatus.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-400"></span> Online';
        syncStatus.className = 'bg-emerald-800 border border-emerald-600 px-2.5 py-1 rounded-full text-emerald-100 flex items-center gap-1.5';
    });
    window.addEventListener('offline', () => {
        syncStatus.innerHTML = '<span class="w-2 h-2 rounded-full bg-amber-400"></span> Offline (Cached)';
        syncStatus.className = 'bg-amber-800 border border-amber-600 px-2.5 py-1 rounded-full text-amber-100 flex items-center gap-1.5';
    });
});
