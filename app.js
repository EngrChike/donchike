const supabaseUrl = 'https://opszvifybrteqdfozbkr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9wc3p2aWZ5YnJ0ZXFkZm96YmtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwMTQ5MzQsImV4cCI6MjA5MzU5MDkzNH0.cToJ5sLDcXGgDfJS2o_Ww-fwb69FaUgS4rriQfiGjeI';

let _db, inventory = [], customers = [], queue = [], editingProdId = null;
let activeBatch = 'ALL';

document.addEventListener('DOMContentLoaded', () => {
    _db = supabase.createClient(supabaseUrl, supabaseKey);
    loadData();
});

async function loadData() {
    const resP = await _db.from('products').select('*').order('name');
    const resC = await _db.from('customers').select('*').order('updated_at', { ascending: false });
    inventory = resP.data || [];
    customers = resC.data || [];
    
    updateBatchDropdown();
    renderUI();
}

// Update the Dropdown list based on existing batch names in the DB
function updateBatchDropdown() {
    const batches = [...new Set(inventory.map(p => p.batch_name))].filter(b => b);
    const select = document.getElementById('batch-filter');
    if(select) {
        select.innerHTML = '<option value="ALL">Show All Batches</option>' + 
                           batches.map(b => `<option value="${b}">${b}</option>`).join('');
        select.value = activeBatch;
    }
}

// Switch view when user selects a different batch
window.switchBatch = () => {
    activeBatch = document.getElementById('batch-filter').value;
    document.getElementById('current-batch-display').innerText = activeBatch === 'ALL' ? 'All Records' : activeBatch;
    renderUI();
};

// Create a new batch session
window.startNewBatch = () => {
    const name = prompt("Enter the name for the new entry (e.g. November Batch 2025):");
    if (name) {
        activeBatch = name;
        document.getElementById('p-batch').value = name;
        document.getElementById('current-batch-display').innerText = name;
        loadData(); // Refresh to ensure dropdown updates
    }
};

window.saveProduct = async function() {
    const batchName = document.getElementById('p-batch').value;
    const dozens = parseFloat(document.getElementById('p-dozens').value) || 0;
    const priceN = parseFloat(document.getElementById('p-naira').value) || 0;
    const sellC = parseFloat(document.getElementById('p-sell').value) || 0;
    
    const payload = {
        "batch_name": batchName,
        "name": document.getElementById('p-name').value,
        "dozens": dozens, "price_naira": priceN,
        "cost_cfa": parseFloat(document.getElementById('p-cfa').value) || 0,
        "sell_price_cfa": sellC, "total_naira": dozens * priceN,
        "total_expected_cfa": dozens * sellC
    };

    let res = editingProdId ? await _db.from('products').update(payload).eq('id', editingProdId) : await _db.from('products').insert([payload]);
    if (!res.error) { 
        clearProductForm(); 
        activeBatch = batchName; // Auto-switch to the batch we just added to
        loadData(); 
    } else {
        alert(res.error.message);
    }
};

window.saveCustomer = async function() {
    const name = document.getElementById('c-name').value;
    const phone = document.getElementById('c-phone').value;
    const paid = parseFloat(document.getElementById('c-paid').value) || 0;
    const total = queue.reduce((sum, item) => sum + (item.qty * item.price), 0);

    // Link customer to the current batch via a 'batch_tag'
    const { error } = await _db.from('customers').insert([{
        name, phone, items_json: queue, total_amount: total, amount_paid: paid, 
        balance: total - paid, updated_at: new Date().toISOString(),
        batch_tag: activeBatch 
    }]);

    if (!error) {
        for (let item of queue) {
            const p = inventory.find(x => x.id === item.id);
            if (p) await _db.from('products').update({ sold_units: (p.sold_units || 0) + item.qty }).eq('id', item.id);
        }
        queue = []; 
        document.getElementById('sale-queue').innerHTML = 'Basket empty...';
        ['c-name','c-phone','c-paid'].forEach(id => document.getElementById(id).value = '');
        loadData();
    }
};

function renderUI() {
    // Filter logic for Products and Customers
    const filteredInv = activeBatch === 'ALL' ? inventory : inventory.filter(p => p.batch_name === activeBatch);
    
    const filteredCust = activeBatch === 'ALL' ? customers : customers.filter(c => {
        if (c.batch_tag === activeBatch) return true;
        // Check if any product in their receipt belongs to this batch
        return c.items_json?.some(item => {
            const prod = inventory.find(p => p.id === item.id);
            return prod && prod.batch_name === activeBatch;
        });
    });

    // Stats
    const tNaira = filteredInv.reduce((s, p) => s + (p.total_naira || 0), 0);
    const tCfa = filteredInv.reduce((s, p) => s + ((p.dozens || 0) * (p.cost_cfa || 0)), 0);
    const eCfa = filteredInv.reduce((s, p) => s + (p.total_expected_cfa || 0), 0);
    const debt = filteredCust.reduce((s, c) => s + (c.balance || 0), 0);

    document.getElementById('total-naira').innerText = "₦" + tNaira.toLocaleString();
    document.getElementById('total-cfa').innerText = tCfa.toLocaleString();
    document.getElementById('expected-cfa').innerText = eCfa.toLocaleString();
    document.getElementById('total-debt').innerText = debt.toLocaleString();

    document.getElementById('p-list').innerHTML = filteredInv.map(i => `<option value="${i.name}">`).join('');

    // Render Inventory Table
    document.getElementById('inventory-table').innerHTML = filteredInv.map(p => `
        <tr class="border-b border-gray-800 hover:bg-gray-900 transition text-xs">
            <td class="p-4"><span class="text-[10px] text-gray-500 font-mono">${p.batch_name}</span><br><strong>${p.name}</strong></td>
            <td class="p-4">${((p.dozens || 0) - (p.sold_units || 0)).toFixed(1)} <small>Doz</small></td>
            <td class="p-4 text-right font-mono">${(p.sell_price_cfa || 0).toLocaleString()}</td>
            <td class="p-4 text-center"><button onclick="editProduct(${p.id})" class="text-blue-400 font-bold underline">Edit</button></td>
        </tr>`).join('');

    // Render Customer Table
    document.getElementById('customer-table').innerHTML = filteredCust.map(c => {
        const items = (c.items_json || []).map(i => `${i.qty}x ${i.name}`).join(', ');
        return `
        <tr class="border-b border-gray-800 hover:bg-gray-900 transition text-xs">
            <td class="p-4"><strong>${c.name}</strong><br><span class="text-[10px] text-yellow-600 italic">${items}</span></td>
            <td class="p-4 text-gray-400 font-mono">${c.phone || '---'}</td>
            <td class="p-4 text-right font-mono">${(c.total_amount || 0).toLocaleString()}</td>
            <td class="p-4 text-right font-bold ${c.balance > 0 ? 'text-red-500' : 'text-green-500'} font-mono">${(c.balance || 0).toLocaleString()}</td>
            <td class="p-4 text-center flex flex-col gap-1">
                <button onclick="editCustomerPayment(${c.id})" class="bg-yellow-600 text-black px-2 py-1 rounded text-[10px] font-black uppercase">Pay</button>
                <button onclick="deleteCustomer(${c.id})" class="text-red-900 text-[10px] font-bold uppercase">Del</button>
            </td>
        </tr>`;
    }).join('');
}

window.editProduct = (id) => {
    const p = inventory.find(x => x.id === id);
    if (!p) return;
    editingProdId = id;
    document.getElementById('p-title').innerText = "📝 Edit " + p.name;
    document.getElementById('p-batch').value = p.batch_name;
    document.getElementById('p-name').value = p.name;
    document.getElementById('p-dozens').value = p.dozens;
    document.getElementById('p-naira').value = p.price_naira;
    document.getElementById('p-cfa').value = p.cost_cfa;
    document.getElementById('p-sell').value = p.sell_price_cfa;
    document.getElementById('p-cancel').classList.remove('hidden');
    window.scrollTo({top: 0, behavior: 'smooth'});
};

window.clearProductForm = () => {
    editingProdId = null;
    ['p-name','p-dozens','p-naira','p-cfa','p-sell'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('p-batch').value = (activeBatch === 'ALL') ? '' : activeBatch;
    document.getElementById('p-title').innerText = "📦 Stock Entry";
    document.getElementById('p-cancel').classList.add('hidden');
};

window.addToQueue = () => {
    const pName = document.getElementById('sale-prod').value;
    const qty = parseFloat(document.getElementById('sale-qty').value) || 0;
    const p = inventory.find(x => x.name === pName);
    if (p && qty > 0) {
        queue.push({ id: p.id, name: p.name, qty: qty, price: p.sell_price_cfa });
        document.getElementById('sale-queue').innerHTML = queue.map(i => `<div>• ${i.qty} ${i.name}</div>`).join('');
        document.getElementById('sale-prod').value = ''; 
        document.getElementById('sale-qty').value = '';
    }
};

window.editCustomerPayment = async function(id) {
    const c = customers.find(x => x.id === id);
    const val = prompt(`Update Total paid for ${c.name}:`, c.amount_paid);
    if (val !== null) {
        const paid = parseFloat(val) || 0;
        await _db.from('customers').update({ amount_paid: paid, balance: c.total_amount - paid, updated_at: new Date().toISOString() }).eq('id', id);
        loadData();
    }
};

window.deleteCustomer = async function(id) {
    const c = customers.find(x => x.id === id);
    if (confirm("Delete sale and return items to stock?")) {
        if (c.items_json) {
            for (let item of c.items_json) {
                const p = inventory.find(x => x.id === item.id);
                if (p) await _db.from('products').update({ sold_units: Math.max(0, (p.sold_units || 0) - item.qty) }).eq('id', p.id);
            }
        }
        await _db.from('customers').delete().eq('id', id);
        loadData();
    }
};
