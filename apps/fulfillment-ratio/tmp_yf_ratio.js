// 展开折叠方法
function toggleListContent(titleElement) {
    const content = titleElement.nextElementSibling;
    const icon = titleElement.querySelector('.fold_icon');
    content.classList.toggle('show');
    icon.classList.toggle('expanded');
}

// 选中的产品
let state = {
    selectProCode: '',
    ratioSelectList:[],//红利币种下拉
    cashSelectList:[],//总现金币种下拉
    pastSelectList:[],//过往派息币种下拉
}
// 内容显示隐藏
// 获取所有具有fulfillment_ratio类的元素
function isShowContent(){
    const elements = document.querySelectorAll('.fulfillment_ratio');
    elements.forEach(element => {
        // 默认显示，仅隐藏不匹配项
        element.style.display = element.getAttribute('product-code') === state.selectProCode ? 'block' : 'none';
    });
}

// 选中的区域
let region = ''
// 选中的币种
let selectRatioCurrency = ''
let selectCashCurrency = ''
let selectPastCurrency = ''
// function refreshDropSelect() {
//     layui.use(['form'], function () {
//         var form = layui.form;
//         // 区域相关
//         var regionductSelect = document.getElementById('region_select_list');
//         // 获取所有区域li元素
//         var statusItems = document.querySelectorAll('.region_select_list > ul > li');
//         if(statusItems){
//             statusItems.forEach(function(ele) {
//                 var _label = ele.getAttribute('region_text');
//                 var _value = ele.getAttribute('region_code');

//                 if(_label && _value) {
//                     var option = document.createElement('option');
//                     option.value = _value;
//                     option.textContent = _label;
//                     regionductSelect.appendChild(option);
//                 }
//             });
//         }
//         // 专门渲染select组件
//         form.render('select');
//         form.on('select(region_select_list)', function(data){
//             state.selectProCode = ''
//             isShowContent()
//             proSelectList(data.value)
//         });
//     });
// }
// 产品下拉
//data-region="[EXT:EXT_STR8]" data-text="[TITLETEXT]" data-value="[EXT:EXT_STR9]" data-status="[EXT:EXT_STR7]
// proSelectList()
function proSelectList() {
    let selectRegion = getStoredRegion() =='Macau' ?'Macau':'Hong Kong'
    console.log('selectRegion',selectRegion)
    layui.use(['form'], function () {
        var form = layui.form;
        var productSelect = document.getElementById('product_select_list');
        let lang = getSystemLanguageByBrowerUrl()
        if(lang==='tc'){
            productSelect.innerHTML = '<option value="">請選擇</option>';
        } else if(lang==='sc'){
            productSelect.innerHTML = '<option value="">请选择</option>';
        }else{
           productSelect.innerHTML = '<option value="">Please select</option>'; 
        }
        // 获取所有产品列表项
        var proItems = document.querySelectorAll('.pro_select_list > ul > li');
        // 分组
        const groups ={
            primary: [], //一级
            secondary: {}, //二级
            tertiary: {}  //三级
        }
        // 处理所有产品项
        proItems.forEach(item => {
            var _label = item.getAttribute('data-text');
            var _value = item.getAttribute('data-value');
            var _region = item.getAttribute('data-region');
            var _status = item.getAttribute('data-status');
            var _type = item.getAttribute('data-type');
            if (!_label ) {
                return;
            }

            if (!_value && !_type) {
                groups.primary.push({ item, _status,_label });
            } else if (!_value && _type) {
                if (!groups.secondary[_status]) groups.secondary[_status] = [];
                groups.secondary[_status].push({ item, _type, _status,_label });
            } else {
                const regionMatches = 
                _region === selectRegion || 
                (typeof _region === 'string' && _region.split(',').includes(selectRegion));
            // 使用status和type组合作为键
            const key = `${_status}_${_type}`;
            if (!groups.tertiary[key]) groups.tertiary[key] = [];
            if(regionMatches){
                groups.tertiary[key].push({ item, _status, _label, _value, _type, _region }) 
            }
            }
        });
        // 树状结构
        // 用于存储最终层级结构
        const hierarchicalData = buildProductTree(groups);
        console.log('hierarchicalData',hierarchicalData)
        // 渲染到select元素
        hierarchicalData.forEach(mainGroup => {
            // 创建一级分组
            const mainOptGroup = document.createElement('optgroup');
            mainOptGroup.label = mainGroup.label;

            // 添加二级和三级菜单
        mainGroup.children.forEach(subGroup => {
            // 1. 创建二级分类标题（禁用option）
            const subHeader = document.createElement('option');
            subHeader.disabled = true;
            subHeader.textContent = `${subGroup.label}`; // 用特殊符号模拟层级
            mainOptGroup.appendChild(subHeader);
            // 2. 添加三级选项
            subGroup.children.forEach(item => {
                const option = document.createElement('option');
                option.value = item.value; // 确保从数据源获取正确值
                option.textContent = item.label; // 全角空格缩进
                option.dataset.region = item.region; // 保留区域数据
                mainOptGroup.appendChild(option); // 直接挂载到一级optgroup
            });
        });

            productSelect.appendChild(mainOptGroup);
        });
        // 重新渲染Layui select组件
        form.render('select');
        // 绑定事件
        form.on('select(product_select_list)', function(data)
        {
            event.preventDefault(); // 阻止Layui默认行为

            if(selectRegion == 'Macau'){
                region = 'MO';
            }else{
                region = 'HK';
            }
            state.selectProCode = data.value;
            currencyRatioList()
            // getRatioList();
            // getRatioList1();
            currencyCashList();
            getCashList();
            getCashList1();
            currencyPastList();
            // getPastList();
            // getPastList1();
            isShowContent();
            insertRatioTableContent();
        });
        // 重新渲染Layui select组件
        form.render('select');
    });
}
function buildProductTree(groups) {
const tree = [];

// 处理一级分组
groups.primary.forEach(primaryItem => {
    const primaryNode = {
        label: primaryItem._label,
        status: primaryItem._status,
        children: []
    };

    // 查找匹配的二级分组
    const secondaryItems = groups.secondary[primaryItem._status] || [];
    secondaryItems.forEach(secondaryItem => {
        const secondaryNode = {
            label: secondaryItem._type,
            type: secondaryItem._type,
            status: secondaryItem._status,
            children: []
        };

        // 查找匹配的三级分组
        const tertiaryKey = `${secondaryItem._status}_${secondaryItem._type}`;
        const tertiaryItems = groups.tertiary[tertiaryKey] || [];
        
        // 添加三级项
        tertiaryItems.forEach(tertiaryItem => {
            secondaryNode.children.push({
                label: tertiaryItem._label,
                value: tertiaryItem._value,
                region: tertiaryItem._region,
                type: tertiaryItem._type,
                status: tertiaryItem._status
            });
        });

        // // 只有当三级分组有内容时才添加二级分组
        if (secondaryNode.children.length > 0) {
            primaryNode.children.push(secondaryNode);
        }
    });

    // 只有当二级分组有内容时才添加一级分组
    if (primaryNode.children.length > 0) {
        tree.push(primaryNode);
    }
});

return tree;
}
//币种下拉
// 額外紅利/年終紅利及終期紅利之分紅實現率币种下拉
function currencyRatioList(){
    https()
        .request({
            method: 'post',
            url: '/aisite-applyapi/hk/support/dividend/currency',
            data: {
                "productCode": state.selectProCode
            },
        }).then(res => {
        if(res.code==200){
            state.ratioSelectList = [];
            state.ratioSelectList = res.data;
            console.log('红利下拉',res)
            currencyRatioDropSelect()
        }
    })
        .catch(error => {
            // showError(error.message);
            console.log('error',error)
        });
}
function currencyRatioDropSelect() {
    layui.use(['form'], function () {
        var form = layui.form;
        // 获取币种select元素
        var currencyductSelect = document.getElementById('currency_ratio_select_list');
        // 获取所有币种li元素
        // var statusItems = document.querySelectorAll('.currency_list > ul > li');
        var statusItems = state.ratioSelectList
        let lang = getSystemLanguageByBrowerUrl()
        // 先清空select，只保留默认选项
        if(currencyductSelect){
            if(lang==='tc'){
                currencyductSelect.innerHTML = '<option value="">請選擇</option>';
            } else if(lang==='sc'){
                currencyductSelect.innerHTML = '<option value="">请选择</option>';
            }else{
                currencyductSelect.innerHTML = '<option value="">Please select</option>'; 
            }
        }
        // 默认币种值，可以根据需要修改
        var defaultCurrency = 'USD';
        var hasDefault = false;

        if(statusItems){
            statusItems.forEach(function(ele) {
                var _label = ele.currency;
                var _value = ele.value;

                if(_label && _value) {
                    var option = document.createElement('option');
                    option.value = _value;
                    option.textContent = _label;
                    console.log('option',option)
                    // 如果当前币种是默认值，设置selected属性
                    if(_value === defaultCurrency) {
                        option.selected = true;
                        hasDefault = true;
                        selectRatioCurrency = 'USD'
                    }
                    currencyductSelect.appendChild(option);
                }
            });
        }

        // 如果没有找到默认币种，但列表不为空，则默认选中第一个币种
        if(!hasDefault && (currencyductSelect.options && currencyductSelect.options.length > 1)) {
            currencyductSelect.options[1].selected = true;
            selectRatioCurrency = currencyductSelect.options[1].value
            console.log('选中的币种',selectRatioCurrency)
            // getRatioList()
            // getRatioList1()
        }
            getRatioList()
            getRatioList1()
        // 专门渲染select组件
        form.render('select');
        form.on('select(currency_ratio_select_list)', function(data){
            selectRatioCurrency = data.value
            console.log('走了',data.value)
            getRatioList()
            getRatioList1()
        });
    });
}
// 縂現金價值比率币种下拉
function currencyCashList(){
    https()
        .request({
            method: 'post',
            url: '/aisite-applyapi/hk/support/totalCash/currency',
            data: {
                "productCode": state.selectProCode
            },
        }).then(res => {
        if(res.code==200){
            state.cashSelectList = []
            state.cashSelectList = res.data;
            console.log('縂現金價值',res)
            currencyCashDropSelect()
        }
    })
        .catch(error => {
            // showError(error.message);
            console.log('error',error)
        });
}
function currencyCashDropSelect() {
    layui.use(['form'], function () {
        var form = layui.form;
        // 获取币种select元素
        var currencyCashSelect = document.getElementById('currency_cash_select_list');
        // 获取所有币种li元素
        var statusItems =  state.cashSelectList;
        let lang = getSystemLanguageByBrowerUrl()
        // 先清空select，只保留默认选项
        if(currencyCashSelect){
            if(lang==='tc'){
                currencyCashSelect.innerHTML = '<option value="">請選擇</option>';
            } else if(lang==='sc'){
                currencyCashSelect.innerHTML = '<option value="">请选择</option>';
            }else{
                currencyCashSelect.innerHTML = '<option value="">Please select</option>'; 
            }
        }
        // 默认币种值，可以根据需要修改
        var defaultCurrency = 'USD';
        var hasDefault = false;

        if(statusItems){
            statusItems.forEach(function(ele) {
                var _label = ele.currency;
                var _value = ele.value;

                if(_label && _value) {
                    var option = document.createElement('option');
                    option.value = _value;
                    option.textContent = _label;

                    // 如果当前币种是默认值，设置selected属性
                    if(_value === defaultCurrency) {
                        option.selected = true;
                        hasDefault = true;
                        selectCashCurrency = defaultCurrency
                    }

                    currencyCashSelect.appendChild(option);
                }
            });
        }

        // 如果没有找到默认币种，但列表不为空，则默认选中第一个币种
        if(!hasDefault && currencyCashSelect && currencyCashSelect.options.length > 1) {
            currencyCashSelect.options[1].selected = true;
            selectCashCurrency = currencyCashSelect.options[1].value
            // getCashList()
            // getCashList1()
        }
           getCashList()
            getCashList1()
        // 专门渲染select组件
        form.render('select');
        form.on('select(currency_cash_select_list)', function(data){
            selectCashCurrency =data.value
            getCashList()
            getCashList1()
        });
    });
}
 // 过往派息比率币种下拉
 function currencyPastList(){
    https()
        .request({
            method: 'post',
            url: '/aisite-applyapi/hk/support/pastDividend/currency',
            data: {
                "productCode": state.selectProCode,
                 "region":region
            },
        }).then(res => {
        if(res.code==200){
            state.pastSelectList = []
            state.pastSelectList = res.data;
            console.log('过往派息',res)
            currencyPastDropSelect()
        }
    })
        .catch(error => {
            // showError(error.message);
            console.log('error',error)
        });
}
 function currencyPastDropSelect() {
    layui.use(['form'], function () {
        var form = layui.form;
        // 获取币种select元素
        var currencyPastSelect = document.getElementById('currency_past_select_list');
        // 获取所有币种li元素
        var statusItems = [];
        statusItems = state.pastSelectList;
        console.log('statusItems',statusItems)
        let lang = getSystemLanguageByBrowerUrl()
        // 先清空select，只保留默认选项
        if(currencyPastSelect){
            if(lang==='tc'){
                currencyPastSelect.innerHTML = '<option value="">請選擇</option>';
            } else if(lang==='sc'){
                currencyPastSelect.innerHTML = '<option value="">请选择</option>';
            }else{
                currencyPastSelect.innerHTML = '<option value="">Please select</option>'; 
            } 
        }
       

        // 默认币种值，可以根据需要修改
        var defaultCurrency = 'USD';
        var hasDefault = false;

        if(statusItems){
            console.log('statusItems1',statusItems)
            statusItems.forEach(function(ele) {
                console.log('statusItems2',ele)
                var _label = ele.currency;
                var _value = ele.value;

                if(_label && _value) {
                    var option = document.createElement('option');
                    option.value = _value;
                    option.textContent = _label;
                    
                    // 如果当前币种是默认值，设置selected属性
                    if(_value === defaultCurrency) {
                        option.selected = true;
                        hasDefault = true;
                        selectPastCurrency = defaultCurrency
                        //  getPastList()
                        //  getPastList1()
                    }

                    currencyPastSelect.appendChild(option);
                }
            });
        }

        // 如果没有找到默认币种，但列表不为空，则默认选中第一个币种
        if(!hasDefault && currencyPastSelect.options.length > 1) {
            currencyPastSelect.options[1].selected = true;
            selectPastCurrency = currencyPastSelect.options[1].value
            // getPastList()
            // getPastList1()
        }
           getPastList()
            getPastList1()
        // 专门渲染select组件
        form.render('select');
        form.on('select(currency_past_select_list)', function(data){
            selectPastCurrency =data.value
            getPastList()
            getPastList1()
        });
    });
}
// 額外紅利/年終紅利及終期紅利之分紅實現率（香港/澳門）表格插入
function insertRatioTableContent() {
// 找到所有具有 'main-content' 类的 div 元素
    const fulfillmentRatios = document.querySelectorAll('.fulfillment_ratio');
    // 額外紅利/年終紅利及終期紅利之分紅實現率
    const ratio_select = document.getElementById('ratio-select')
    if(ratio_select){
        ratio_select.style.display ='none'
    }
    const ratio_table_content =  document.getElementById('ratio-table-content')
     //无tab
     const ratio_table_content1 =  document.getElementById('ratio-table-content1')
    //  縂現金價值比率（香港/澳門）
    const cash_select = document.getElementById('cash-select')
    if(cash_select){
        cash_select.style.display ='none'
    }
    const cash_table_content =  document.getElementById('cash-table-content')
    //无tab
    const cash_table_content1 =  document.getElementById('cash-table-content1')
    // 过往派息表格
    const  past_select = document.getElementById('past-select')
     past_select.style.display ='none'
    const past_table_content =  document.getElementById('past-table-content')
    //无tab
    const past_table_content1 =  document.getElementById('past-table-content1')
    // 遍历这些元素，找到 style 显示为 block 的那个
    let targetRatioTable = null;
    let targetCashTable = null;
    let targetPastTable = null;
    for (const content of fulfillmentRatios) {
        if (content.style.display === 'block') {
            // 在这个可见的 main-content 中查找 id 为 health-table 的元素
            if(content.querySelector('#ratio-table')!==null){
                targetRatioTable = content.querySelector('#ratio-table');
            }
            if(content.querySelector('#cash-table')!==null){
                targetCashTable = content.querySelector('#cash-table');
            }
            if(content.querySelector('#past-table')!==null){
                targetPastTable = content.querySelector('#past-table');
            }
            // break;
        }
    }
    // 如果找到了目标元素
    ratio_select.style.display ='block'
    if (targetRatioTable) {
        console.log('sssssss')
        targetRatioTable.insertAdjacentElement('beforeend', ratio_select);
        ratio_select.style.display ='block'
        if(ratio_table_content){
            console.log('sssssss带督导')
            ratio_table_content.style.display = 'block'
            targetRatioTable.insertAdjacentElement('beforeend', ratio_table_content);
        }
        if(ratio_table_content1){
            ratio_table_content1.style.display = 'block'
            targetRatioTable.insertAdjacentElement('beforeend', ratio_table_content1);
        }
     } else {
                if(ratio_table_content){
                    ratio_table_content.style.display = 'none'
                }
                if(ratio_table_content1){
                  ratio_table_content1.style.display = 'none'  
                }
                // if(ratio_select){
                   ratio_select.style.display ='none' 
                // }
             console.log('sssssss隐藏')   
        }

       // 如果找到了目标元素
       if (targetCashTable) {
         targetCashTable.insertAdjacentElement('beforeend', cash_select);
        cash_select.style.display ='block'
        if(cash_table_content){
        //      targetCashTable.insertAdjacentElement('beforeend', cash_select);
        // cash_select.style.display ='block'
            cash_table_content.style.display = 'block'
            targetCashTable.insertAdjacentElement('beforeend', cash_table_content);
        }
        if(cash_table_content1){
        //      targetCashTable.insertAdjacentElement('beforeend', cash_select);
        // cash_select.style.display ='block'
            cash_table_content1.style.display = 'block'
            targetCashTable.insertAdjacentElement('beforeend', cash_table_content1);
        }
        // 在这里可以对 targetHealthTable 进行操作
     } else {   
                if(cash_table_content){
                   cash_table_content.style.display = 'none'
                }
                if(cash_table_content1){
                   cash_table_content1.style.display = 'none'
                }    
    }

     // 如果找到了目标元素
     if (targetPastTable) {
        targetPastTable.insertAdjacentElement('beforeend', past_select);
        past_select.style.display ='block'
        if(past_table_content){
            past_table_content.style.display = 'block'
            targetPastTable.insertAdjacentElement('beforeend', past_table_content);
        }
        if(past_table_content1){
            past_table_content1.style.display = 'block'
            targetPastTable.insertAdjacentElement('beforeend', past_table_content1);
        }
        // 在这里可以对 targetHealthTable 进行操作
     } else {   
                if(past_table_content){
                   past_table_content.style.display = 'none' 
                }
                if(past_table_content1){
                  past_table_content1.style.display = 'none'  
                }
                past_select.style.display ='none'
        }
        
    }
// 确保DOM加载完成
document.addEventListener('updateSystemLanguage', function() {
    // refreshDropSelect();
    // currencyRatioDropSelect()
    // currencyCashDropSelect()
    // currencyPastDropSelect()
    insertRatioTableContent()
    proSelectList()
    // getRatioList()
    // getRatioList1()
    // getCashList()
    // getCashList1()
    // getPastList()
    // getPastList1()
    // currencyRatioList()
	
	//删除隐藏class 2025-07-14
	document.querySelectorAll(".personality-tpl-main").forEach(el => {
		el.classList.remove("load_hide_copy");
	});
});
// 存储表格数据
let ratioTableData = null;
// 当前选中的福利类型索引（移动端使用）
let currentBenefitIndex = 0;
function getRatioList(){
    // 调用API获取数据并渲染表格
    https()
        .request({
            method: 'post',
            url: '/aisite-applyapi/hk/support/getDividend',
            data: {
                "productCode": state.selectProCode,
                "currency": selectRatioCurrency,
                "region":region
            },
        }).then(res => {
        if(res.code==200){
            ratioTableData = res.data;
            renderTable();
            // 添加窗口大小改变事件监听
            window.addEventListener('resize', handleRatioResize);
        }
    })
        .catch(error => {
            // showError(error.message);
            console.log('error',error)
        });
}

// 窗口大小改变处理函数
function handleRatioResize() {
    if (ratioTableData) {
        renderTable();
    }
}

// 渲染表格（根据屏幕宽度自动选择PC或移动端样式）
function renderTable() {
    const container = document.getElementById('ratio-table-container');
    if(container ){
   container.innerHTML = '';

    if (window.innerWidth > 953) {
        container.appendChild(createTableWithOriginalFormat(ratioTableData));
    } else {
        container.appendChild(createMobileTable(ratioTableData));
    }
  }
 
}
/**
 * 创建保持原始格式的表格
 */
function createTableWithOriginalFormat(data) {
    const table = document.createElement('table');
    table.className = 'benefit-table';
    // 创建表头
    const thead = document.createElement('thead');

    // 主标题行
    const mainHeaderRow = document.createElement('tr');
    const leftHeaderCell = document.createElement('th');
    leftHeaderCell.rowSpan = 2;
    leftHeaderCell.className = 'main-header';
    let lang = getSystemLanguageByBrowerUrl()
        if(lang === 'sc'){
            leftHeaderCell.textContent = '非保证类别';
        } else if(lang === 'tc'){
            leftHeaderCell.textContent = '非保證類別';
        } else {
            leftHeaderCell.textContent = 'Type of non-guaranteed benefit';
        }
    // leftHeaderCell.textContent = 'Type of non-guaranteed benefit';
    mainHeaderRow.appendChild(leftHeaderCell);

    const rightHeaderCell = document.createElement('th');
    rightHeaderCell.colSpan = 6;
    rightHeaderCell.className = 'main-header';
    rightHeaderCell.textContent = data.header.rightTitle;
    mainHeaderRow.appendChild(rightHeaderCell);
    thead.appendChild(mainHeaderRow);

    // 第一组年份标题行
    const yearHeaderRow1 = document.createElement('tr');
    data.years.slice(0, 6).forEach(year => {
        const cell = document.createElement('th');
        cell.className = 'year-header';
        cell.textContent = year;
        yearHeaderRow1.appendChild(cell);
    });
    thead.appendChild(yearHeaderRow1);

    table.appendChild(thead);

    // 创建表体
    const tbody = document.createElement('tbody');

    // 定义处理数据组的函数
    const processDataGroup = (startIndex, endIndex, isFirstGroup) => {
        if (!isFirstGroup) {
            // 第二组年份标题行
            const yearHeaderRow = document.createElement('tr');
            const emptyCell = document.createElement('th');
            emptyCell.className = 'year-header';
            yearHeaderRow.appendChild(emptyCell);

            data.years.slice(startIndex, endIndex).forEach(year => {
                const cell = document.createElement('th');
                cell.className = 'year-header';
                cell.textContent = year;
                yearHeaderRow.appendChild(cell);
            });

            // 补充空单元格使总列数为6
            while (yearHeaderRow.children.length < 6) {
                const cell = document.createElement('th');
                cell.className = 'year-header';
                yearHeaderRow.appendChild(cell);
            }

            tbody.appendChild(yearHeaderRow);
        }

        // 处理数据行
        data.benefits.forEach(benefit => {
            const row = document.createElement('tr');
            const titleCell = document.createElement('td');
            titleCell.className = 'data-cell blue-text';
            titleCell.textContent = benefit.name;
            row.appendChild(titleCell);

            benefit.values.slice(startIndex, endIndex).forEach((value, i) => {
                const cell = document.createElement('td');
                cell.className = 'data-cell';

                // 检查是否有上角标
                const supIndex = startIndex + i;
                if (benefit.sups && benefit.sups[supIndex]) {
                    // 分割值和上角标
                    const baseValue = value.replace(benefit.sups[supIndex], '');
                    const supValue = benefit.sups[supIndex];

                    // 创建包含上角标的文本
                    cell.innerHTML = `${baseValue}<sup class="sup">${supValue}</sup>`;
                } else {
                    cell.textContent = value;
                }

                row.appendChild(cell);
            });
            tbody.appendChild(row);
        });
    };

    // 使用循环处理所有数据，每6个为一组
    const groupSize = 6;
    for (let i = 0; i < data.years.length; i += groupSize) {
        const isFirstGroup = i === 0;
        processDataGroup(i, i + groupSize, isFirstGroup);
    }

    table.appendChild(tbody);
    return table;
}

/**
 * 创建移动端表格
 */
function createMobileTable(data) {
    // 创建主容器
    const container = document.createElement('div');
    container.className = 'mobile-table-container';

    // 创建标签页容器
    const tabContainer = document.createElement('div');
    tabContainer.className = 'tab-container';

    // 创建表格内容容器
    const contentContainer = document.createElement('div');
    contentContainer.className = 'content-container';

    // 创建表格（只创建一个）
    const table = document.createElement('table');
    table.className = 'table-content benefit-table';

    // 创建表头
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');

    const yearHeader = document.createElement('th');
    yearHeader.textContent = data.header.rightTitle;
    yearHeader.className = 'year-content';
    headerRow.appendChild(yearHeader);

    const valueHeader = document.createElement('th');
    valueHeader.className = 'year-content';

    // 创建福利类型显示元素
    const benefitType = document.createElement('div');
    benefitType.className = 'benefit-type';
    benefitType.textContent = data.benefits[currentBenefitIndex].name;
    let lang = getSystemLanguageByBrowerUrl()
        if(lang === 'sc'){
            valueHeader.appendChild(document.createTextNode('非保证类别' ));
        } else if(lang === 'tc'){
            valueHeader.appendChild(document.createTextNode('非保證類別' ));
        } else {
            valueHeader.appendChild(document.createTextNode('Type of non-guaranteed benefit' ));
        }
    // valueHeader.appendChild(document.createTextNode('Type of non-guaranteed benefit' ));
    valueHeader.appendChild(benefitType);

    headerRow.appendChild(valueHeader);
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // 创建表格内容
    const tbody = document.createElement('tbody');

    // 初始化表格内容（显示当前选中的福利类型的数据）
    data.years.forEach((year, yearIndex) => {
        const row = document.createElement('tr');

        // 年份单元格
        const yearCell = document.createElement('td');
        yearCell.textContent = year;
        row.appendChild(yearCell);

        // 值单元格
        const valueCell = document.createElement('td');
        const currentBenefit = data.benefits[currentBenefitIndex];
        const value = currentBenefit.values[yearIndex] || 'N/A*';

        // 检查是否有上角标
        if (currentBenefit.sups && currentBenefit.sups[yearIndex]) {
            // 分割值和上角标
            const baseValue = value.replace(currentBenefit.sups[yearIndex], '');
            const supValue = currentBenefit.sups[yearIndex];

            // 创建包含上角标的文本
            valueCell.innerHTML = `${baseValue}<sup class="sup">${supValue}</sup>`;
        } else {
            valueCell.textContent = value;
        }

        row.appendChild(valueCell);

        tbody.appendChild(row);
    });

    table.appendChild(tbody);
    contentContainer.appendChild(table);

    // 创建标签页
    data.benefits.forEach((benefit, index) => {
        const tab = document.createElement('div');
        tab.className = 'tab' + (index === currentBenefitIndex ? ' active' : '');
        tab.textContent = benefit.name;
        tab.dataset.index = index;

        // 标签点击事件
        tab.addEventListener('click', function() {
            // 更新当前选中的福利类型索引
            currentBenefitIndex = parseInt(this.dataset.index);

            // 重新渲染表格（会保持当前的PC/移动端样式）
            renderTable();
        });

        tabContainer.appendChild(tab);
    });

    container.appendChild(tabContainer);
    container.appendChild(contentContainer);

    return container;
}

/**
 * 显示错误信息
 * @param {string} message 错误信息
 */
function showError(message) {
    const container = document.getElementById('ratio-table-container');
    container.innerHTML = '';
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error';
    errorDiv.textContent = `数据加载失败: ${message}`;
    container.appendChild(errorDiv);
}

// 存储表格数据
let ratioTableData1 = null;
function getRatioList1(){
    https()
        .request({
            method: 'post',
            url: '/aisite-applyapi/hk/support/getDividend',
            data: {
                "productCode": state.selectProCode,
                "currency": selectRatioCurrency,
                "region":region
            },
        }).then(res => {
        if(res.code==200){
            ratioTableData1 = res.data;
            renderTable1();
            // 添加窗口大小改变事件监听
            window.addEventListener('resize', handleRatioResize1);
        }
    })
        .catch(error => {
            // showError(error.message);
            console.log('error',error)
        });
}
// 窗口大小改变处理函数
function handleRatioResize1() {
    if (ratioTableData1) {
        renderTable1();
    }
}

// 渲染表格（根据屏幕宽度自动选择PC或移动端样式）
function renderTable1() {
    const container = document.getElementById('ratio-table-container1');
    container.innerHTML = '';

    if (window.innerWidth > 953) {
        container.appendChild(createTableWithOriginalFormat1(ratioTableData1));
    } else {
        container.appendChild(createMobileTable1(ratioTableData1));
    }
}

/**
 * 创建保持原始格式的表格
 * @param {Object} data 表格数据
 * @returns {HTMLElement} 表格DOM元素
 */
function createTableWithOriginalFormat1(data) {
    const table = document.createElement('table');
    table.className = 'benefit-table';

    // 创建表头
    const thead = document.createElement('thead');

    // 主标题行
    const mainHeaderRow = document.createElement('tr');
    const leftHeaderCell = document.createElement('th');
    leftHeaderCell.rowSpan = 2;
    leftHeaderCell.className = 'main-header';
    let lang = getSystemLanguageByBrowerUrl()
        if(lang === 'sc'){
            leftHeaderCell.textContent = '非保证类别';
        } else if(lang === 'tc'){
            leftHeaderCell.textContent = '非保證類別';
        } else {
            leftHeaderCell.textContent = 'Type of non-guaranteed benefit';
        }
    // leftHeaderCell.textContent = 'Type of non-guaranteed benefit';
    mainHeaderRow.appendChild(leftHeaderCell);

    const rightHeaderCell = document.createElement('th');
    rightHeaderCell.colSpan = 6;
    rightHeaderCell.className = 'main-header';
    rightHeaderCell.textContent = data.header.rightTitle;
    mainHeaderRow.appendChild(rightHeaderCell);
    thead.appendChild(mainHeaderRow);

    // 第一组年份标题行
    const yearHeaderRow1 = document.createElement('tr');
    data.years.slice(0, 6).forEach(year => {
        const cell = document.createElement('th');
        cell.className = 'year-header';
        cell.textContent = year;
        yearHeaderRow1.appendChild(cell);
    });
    thead.appendChild(yearHeaderRow1);

    table.appendChild(thead);

    // 创建表体
    const tbody = document.createElement('tbody');

    // 定义处理数据组的函数
    const processDataGroup = (startIndex, endIndex, isFirstGroup) => {
        if (!isFirstGroup) {
            // 第二组年份标题行
            const yearHeaderRow = document.createElement('tr');
            const emptyCell = document.createElement('th');
            emptyCell.className = 'year-header';
            yearHeaderRow.appendChild(emptyCell);

            data.years.slice(startIndex, endIndex).forEach(year => {
                const cell = document.createElement('th');
                cell.className = 'year-header';
                cell.textContent = year;
                yearHeaderRow.appendChild(cell);
            });

            // 补充空单元格使总列数为6
            while (yearHeaderRow.children.length < 6) {
                const cell = document.createElement('th');
                cell.className = 'year-header';
                yearHeaderRow.appendChild(cell);
            }

            tbody.appendChild(yearHeaderRow);
        }

        // 处理数据行
        data.benefits.forEach(benefit => {
            const row = document.createElement('tr');
            const titleCell = document.createElement('td');
            titleCell.className = 'data-cell blue-text';
            titleCell.textContent = benefit.name;
            row.appendChild(titleCell);

            benefit.values.slice(startIndex, endIndex).forEach((value, i) => {
                const cell = document.createElement('td');
                cell.className = 'data-cell';

                // 检查是否有上角标
                const supIndex = startIndex + i;
                if (benefit.sups && benefit.sups[supIndex]) {
                    // 分割值和上角标
                    const baseValue = value.replace(benefit.sups[supIndex], '');
                    const supValue = benefit.sups[supIndex];

                    // 创建包含上角标的文本
                    cell.innerHTML = `${baseValue}<sup class="sup">${supValue}</sup>`;
                } else {
                    cell.textContent = value;
                }

                row.appendChild(cell);
            });

            // 补充空单元格使总列数为6
            // while (row.children.length < 6) {
            //     const cell = document.createElement('td');
            //     cell.className = 'data-cell';
            //     cell.textContent = "N/A*";
            //     row.appendChild(cell);
            // }

            tbody.appendChild(row);
        });
    };

    // 使用循环处理所有数据，每6个为一组
    const groupSize = 6;
    for (let i = 0; i < data.years.length; i += groupSize) {
        const isFirstGroup = i === 0;
        processDataGroup(i, i + groupSize, isFirstGroup);
    }

    table.appendChild(tbody);
    return table;
}

/**
 * 创建移动端表格（三列布局）
 */
function createMobileTable1(data) {
    // 创建主容器
    const container = document.createElement('div');
    container.className = 'mobile-table-container';

    // 创建表格
    const table = document.createElement('table');
    table.className = 'table-content benefit-table';

    // 创建表头
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    // 左
    const leftHeaderCell = document.createElement('th');
    leftHeaderCell.rowSpan = 2;
    leftHeaderCell.className = 'main-header';
    leftHeaderCell.textContent = data.header.rightTitle;
    headerRow.appendChild(leftHeaderCell);
    // 右
    const rightHeaderCell = document.createElement('th');
    rightHeaderCell.colSpan = 2;
    let lang = getSystemLanguageByBrowerUrl()
        if(lang === 'sc'){
            rightHeaderCell.textContent = '非保证类别';
        } else if(lang === 'tc'){
            rightHeaderCell.textContent = '非保證類別';
        } else {
            rightHeaderCell.textContent = 'Type of non-guaranteed benefit';
        }
    // rightHeaderCell.textContent = 'Type of non-guaranteed benefit';
    rightHeaderCell.className = 'year-content';
    headerRow.appendChild(rightHeaderCell);
    thead.appendChild(headerRow);

    // 添加两个福利类型作为列标题
    // 第一组年份标题行
    const yearHeaderRow1 = document.createElement('tr');
    data.benefits.forEach(benefit => {
        const benefitHeader = document.createElement('th');
        benefitHeader.textContent = benefit.name;
        benefitHeader.className = 'year-content text-center';
        yearHeaderRow1.appendChild(benefitHeader);
    });
    thead.appendChild(yearHeaderRow1);
    table.appendChild(thead);

    // 创建表体
    const tbody = document.createElement('tbody');

    // 遍历所有年份
    data.years.forEach((year, yearIndex) => {
        const row = document.createElement('tr');

        // 年份单元格
        const yearCell = document.createElement('td');
        yearCell.textContent = year;
        row.appendChild(yearCell);

        // 添加两个福利类型的值
        data.benefits.forEach(benefit => {
            const valueCell = document.createElement('td');
            const value = benefit.values[yearIndex] || 'N/A*';

            // 检查是否有上角标
            if (benefit.sups && benefit.sups[yearIndex]) {
                // 分割值和上角标
                const baseValue = value.replace(benefit.sups[yearIndex], '');
                const supValue = benefit.sups[yearIndex];

                // 创建包含上角标的文本
                valueCell.innerHTML = `${baseValue}<sup class="sup">${supValue}</sup>`;
            } else {
                valueCell.textContent = value;
            }

            row.appendChild(valueCell);
        });

        tbody.appendChild(row);
    });

    table.appendChild(tbody);
    container.appendChild(table);

    return container;
}

/**
 * 显示错误信息
 * @param {string} message 错误信息
 */
function showError(message) {
    const container = document.getElementById('ratio-table-container1');
    container.innerHTML = '';
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error';
    errorDiv.textContent = `数据加载失败: ${message}`;
    container.appendChild(errorDiv);
}


// 存储表格数据
let tableCashData = null;
// 当前选中的福利类型索引（移动端使用）
let currentCashIndex = 0;
function getCashList(){
    https()
        .request({
            method: 'post',
            url: '/aisite-applyapi/hk/support/getTotalCash',
            data: {
                "productCode": state.selectProCode,
                "currency": selectCashCurrency,
                "region":region
            },
        }).then(res => {
        if(res.code==200){
            tableCashData = res.data;
            cashTable();

            // 添加窗口大小改变事件监听
            window.addEventListener('resize', handleResize);
        }
    })
        .catch(error => {
            // showError(error.message);
            console.log('error',error)
        });
}

// 窗口大小改变处理函数
function handleResize() {
    if (tableCashData) {
        cashTable();
    }
}

// 渲染表格（根据屏幕宽度自动选择PC或移动端样式）
function cashTable() {
    const container = document.getElementById('cash-table-container');
    if(container ){
 container.innerHTML = '';

    if (window.innerWidth > 953) {
        container.appendChild(createCashTable(tableCashData));
    } else {
        container.appendChild(createMobileCashTable(tableCashData));
    }
  }
   
}
/**
 * 创建保持原始格式的表格
 */
function createCashTable(data) {
    const cashTable = document.createElement('table');
    cashTable.className = 'benefit-table';

    // 创建表头
    const thead = document.createElement('thead');

    // 主标题行
    const mainHeaderRow = document.createElement('tr');
    const leftHeaderCell = document.createElement('th');
    leftHeaderCell.rowSpan = 2;
    leftHeaderCell.className = 'main-header';
    leftHeaderCell.textContent = '';
    mainHeaderRow.appendChild(leftHeaderCell);

    const rightHeaderCell = document.createElement('th');
    rightHeaderCell.colSpan = 6;
    rightHeaderCell.className = 'main-header';
    rightHeaderCell.textContent = data.header.rightTitle;
    mainHeaderRow.appendChild(rightHeaderCell);
    thead.appendChild(mainHeaderRow);

    // 第一组年份标题行
    const yearHeaderRow1 = document.createElement('tr');
    data.years.slice(0, 6).forEach(year => {
        const cell = document.createElement('th');
        cell.className = 'year-header';
        cell.textContent = year;
        yearHeaderRow1.appendChild(cell);
    });
    thead.appendChild(yearHeaderRow1);

    cashTable.appendChild(thead);

    // 创建表体
    const tbody = document.createElement('tbody');

    // 定义处理数据组的函数
    const processDataGroup = (startIndex, endIndex, isFirstGroup) => {
        if (!isFirstGroup) {
            // 第二组年份标题行
            const yearHeaderRow = document.createElement('tr');
            const emptyCell = document.createElement('th');
            emptyCell.className = 'year-header';
            yearHeaderRow.appendChild(emptyCell);

            data.years.slice(startIndex, endIndex).forEach(year => {
                const cell = document.createElement('th');
                cell.className = 'year-header';
                cell.textContent = year;
                yearHeaderRow.appendChild(cell);
            });

            // 补充空单元格使总列数为6
            while (yearHeaderRow.children.length < 6) {
                const cell = document.createElement('th');
                cell.className = 'year-header';
                yearHeaderRow.appendChild(cell);
            }

            tbody.appendChild(yearHeaderRow);
        }

        // 处理数据行
        data.benefits.forEach(benefit => {
            const row = document.createElement('tr');
            const titleCell = document.createElement('td');
            titleCell.className = 'data-cell blue-text';
            titleCell.textContent = benefit.name;
            row.appendChild(titleCell);

            benefit.values.slice(startIndex, endIndex).forEach((value, i) => {
                const cell = document.createElement('td');
                cell.className = 'data-cell';

                // 检查是否有上角标
                const supIndex = startIndex + i;
                if (benefit.sups && benefit.sups[supIndex]) {
                    // 分割值和上角标
                    const baseValue = value.replace(benefit.sups[supIndex], '');
                    const supValue = benefit.sups[supIndex];

                    // 创建包含上角标的文本
                    cell.innerHTML = `${baseValue}<sup class="sup">${supValue}</sup>`;
                } else {
                    cell.textContent = value;
                }

                row.appendChild(cell);
            });

            // 补充空单元格使总列数为6
            // while (row.children.length < 6) {
            //     const cell = document.createElement('td');
            //     cell.className = 'data-cell';
            //     cell.textContent = "N/A*";
            //     row.appendChild(cell);
            // }

            tbody.appendChild(row);
        });
    };

    // 使用循环处理所有数据，每6个为一组
    const groupSize = 6;
    for (let i = 0; i < data.years.length; i += groupSize) {
        const isFirstGroup = i === 0;
        processDataGroup(i, i + groupSize, isFirstGroup);
    }

    cashTable.appendChild(tbody);
    return cashTable;
}

/**
 * 创建移动端表格
 */
function createMobileCashTable(data) {
    // 创建主容器
    const container = document.createElement('div');
    container.className = 'mobile-table-container';

    // 创建标签页容器
    const tabContainer = document.createElement('div');
    tabContainer.className = 'tab-container';

    // 创建表格内容容器
    const contentContainer = document.createElement('div');
    contentContainer.className = 'content-container';

    // 创建表格（只创建一个）
    const table = document.createElement('table');
    table.className = 'table-content benefit-table';

    // 创建表头
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');

    const yearHeader = document.createElement('th');
    yearHeader.textContent = data.header.rightTitle;
    yearHeader.className = 'year-content';
    headerRow.appendChild(yearHeader);

    const valueHeader = document.createElement('th');
    valueHeader.className = 'year-content';

    // 创建福利类型显示元素
    const benefitType = document.createElement('div');
    benefitType.className = 'benefit-type';
    benefitType.textContent = data.benefits[currentCashIndex].name;
    valueHeader.appendChild(document.createTextNode('' ));
    valueHeader.appendChild(benefitType);

    headerRow.appendChild(valueHeader);
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // 创建表格内容
    const tbody = document.createElement('tbody');

    // 初始化表格内容（显示当前选中的福利类型的数据）
    data.years.forEach((year, yearIndex) => {
        const row = document.createElement('tr');

        // 年份单元格
        const yearCell = document.createElement('td');
        yearCell.textContent = year;
        row.appendChild(yearCell);

        // 值单元格
        const valueCell = document.createElement('td');
        const currentBenefit = data.benefits[currentCashIndex];
        const value = currentBenefit.values[yearIndex] || 'N/A*';

        // 检查是否有上角标
        if (currentBenefit.sups && currentBenefit.sups[yearIndex]) {
            // 分割值和上角标
            const baseValue = value.replace(currentBenefit.sups[yearIndex], '');
            const supValue = currentBenefit.sups[yearIndex];

            // 创建包含上角标的文本
            valueCell.innerHTML = `${baseValue}<sup class="sup">${supValue}</sup>`;
        } else {
            valueCell.textContent = value;
        }

        row.appendChild(valueCell);

        tbody.appendChild(row);
    });

    table.appendChild(tbody);
    contentContainer.appendChild(table);

    // 创建标签页
    data.benefits.forEach((benefit, index) => {
        const tab = document.createElement('div');
        tab.className = 'tab' + (index === currentCashIndex ? ' active' : '');
        tab.textContent = benefit.name;
        tab.dataset.index = index;

        // 标签点击事件
        tab.addEventListener('click', function() {
            // 更新当前选中的福利类型索引
            currentCashIndex = parseInt(this.dataset.index);

            // 重新渲染表格（会保持当前的PC/移动端样式）
            cashTable();
        });

        tabContainer.appendChild(tab);
    });

    container.appendChild(tabContainer);
    container.appendChild(contentContainer);

    return container;
}

/**
 * 显示错误信息
 * @param {string} message 错误信息
 */
function showError(message) {
    const container = document.getElementById('cash-table-container');
    container.innerHTML = '';
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error';
    errorDiv.textContent = `数据加载失败: ${message}`;
    container.appendChild(errorDiv);
}

// 存储表格数据
let tableCashData1 = null;
// 当前选中的福利类型索引（移动端使用）
let currentCashIndex1 = 0;
function getCashList1(){
    https()
        .request({
            method: 'post',
            url: '/aisite-applyapi/hk/support/getTotalCash',
            data: {
                "productCode": state.selectProCode,
                "currency": selectCashCurrency,
                "region":region
            },
        }).then(res => {
        if(res.code==200){
            tableCashData1 = res.data;
            cashTable1();

            // 添加窗口大小改变事件监听
            window.addEventListener('resize', handleResize1);
        }
    })
        .catch(error => {
            // showError(error.message);
            console.log('error',error)
        });
}
// 窗口大小改变处理函数
function handleResize1() {
    if (tableCashData1) {
        cashTable1();
    }
}

// 渲染表格（根据屏幕宽度自动选择PC或移动端样式）
function cashTable1() {
    const container = document.getElementById('cash-table-container1');
    container.innerHTML = '';

    if (window.innerWidth > 953) {
        container.appendChild(createCashTable1(tableCashData1));
        console.log('createCashTable1(tableCashData1)',createCashTable1(tableCashData1),container)
    } else {
        container.appendChild(createMobileCashTable1(tableCashData1));
    }
}

/**
 * 创建保持原始格式的表格
 * @param {Object} data 表格数据
 * @returns {HTMLElement} 表格DOM元素
 */
function createCashTable1(data) {
    console.log('data',data)
    const cashTable1 = document.createElement('table');
    cashTable1.className = 'benefit-table';

    // 创建表头
    const thead = document.createElement('thead');

    // 主标题行
    const mainHeaderRow = document.createElement('tr');
    const leftHeaderCell = document.createElement('th');
    leftHeaderCell.rowSpan = 2;
    leftHeaderCell.className = 'main-header';
    leftHeaderCell.textContent = data.header.leftTitle;
    mainHeaderRow.appendChild(leftHeaderCell);

    const rightHeaderCell = document.createElement('th');
    rightHeaderCell.colSpan = 6;
    rightHeaderCell.className = 'main-header';
    rightHeaderCell.textContent = data.header.rightTitle;
    mainHeaderRow.appendChild(rightHeaderCell);
    thead.appendChild(mainHeaderRow);

    // 第一组年份标题行
    const yearHeaderRow1 = document.createElement('tr');
    data.years.slice(0, 6).forEach(year => {
        const cell = document.createElement('th');
        cell.className = 'year-header';
        cell.textContent = year;
        yearHeaderRow1.appendChild(cell);
    });
    thead.appendChild(yearHeaderRow1);

    cashTable1.appendChild(thead);

    // 创建表体
    const tbody = document.createElement('tbody');

    // 定义处理数据组的函数
    const processDataGroup = (startIndex, endIndex, isFirstGroup) => {
        if (!isFirstGroup) {
            // 第二组年份标题行
            const yearHeaderRow = document.createElement('tr');
            const emptyCell = document.createElement('th');
            emptyCell.className = 'year-header';
            yearHeaderRow.appendChild(emptyCell);

            data.years.slice(startIndex, endIndex).forEach(year => {
                const cell = document.createElement('th');
                cell.className = 'year-header';
                cell.textContent = year;
                yearHeaderRow.appendChild(cell);
            });

            // 补充空单元格使总列数为6
            while (yearHeaderRow.children.length < 6) {
                const cell = document.createElement('th');
                cell.className = 'year-header';
                yearHeaderRow.appendChild(cell);
            }

            tbody.appendChild(yearHeaderRow);
        }

        // 处理数据行
        data.benefits.forEach(benefit => {
            const row = document.createElement('tr');
            const titleCell = document.createElement('td');
            titleCell.className = 'data-cell blue-text';
            titleCell.textContent = benefit.name;
            row.appendChild(titleCell);

            benefit.values.slice(startIndex, endIndex).forEach((value, i) => {
                const cell = document.createElement('td');
                cell.className = 'data-cell';

                // 检查是否有上角标
                const supIndex = startIndex + i;
                if (benefit.sups && benefit.sups[supIndex]) {
                    // 分割值和上角标
                    const baseValue = value.replace(benefit.sups[supIndex], '');
                    const supValue = benefit.sups[supIndex];

                    // 创建包含上角标的文本
                    cell.innerHTML = `${baseValue}<sup class="sup">${supValue}</sup>`;
                } else {
                    cell.textContent = value;
                }

                row.appendChild(cell);
            });

            // 补充空单元格使总列数为6
            // while (row.children.length < 6) {
            //     const cell = document.createElement('td');
            //     cell.className = 'data-cell';
            //     cell.textContent = "N/A*";
            //     row.appendChild(cell);
            // }

            tbody.appendChild(row);
        });
    };

    // 使用循环处理所有数据，每6个为一组
    const groupSize = 6;
    for (let i = 0; i < data.years.length; i += groupSize) {
        const isFirstGroup = i === 0;
        processDataGroup(i, i + groupSize, isFirstGroup);
    }

    cashTable1.appendChild(tbody);
    return cashTable1;
}

/**
 * 创建移动端表格
 * @param {Object} data 表格数据
 * @returns {HTMLElement} 表格DOM元素
 */
function createMobileCashTable1(data) {
    // 创建主容器
    const container = document.createElement('div');
    container.className = 'mobile-table-container';
    // 创建表格内容容器
    const contentContainer = document.createElement('div');
    contentContainer.className = 'content-container';

    // 创建表格（只创建一个）
    const table = document.createElement('table');
    table.className = 'table-content benefit-table';

    // 创建表头
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');

    const yearHeader = document.createElement('th');
    yearHeader.textContent = data.header.rightTitle;
    yearHeader.className = 'year-content';
    headerRow.appendChild(yearHeader);

    const valueHeader = document.createElement('th');
    valueHeader.className = 'year-content';

    // 创建福利类型显示元素
    data.benefits.forEach(benefit => {
        const benefitHeader = document.createElement('th');
        benefitHeader.textContent = benefit.name;
        benefitHeader.className = 'year-content';
        headerRow.appendChild(benefitHeader);
    });
    // headerRow.appendChild(valueHeader);
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // 创建表格内容
    const tbody = document.createElement('tbody');

    // 初始化表格内容（显示当前选中的福利类型的数据）
    data.years.forEach((year, yearIndex) => {
        const row = document.createElement('tr');

        // 年份单元格
        const yearCell = document.createElement('td');
        yearCell.textContent = year;
        row.appendChild(yearCell);

        // 值单元格
        data.benefits.forEach(benefit => {
            const valueCell = document.createElement('td');
            const currentBenefit = data.benefits[currentCashIndex1];
            const value = currentBenefit.values[yearIndex] || 'N/A*';

            // 检查是否有上角标
            if (currentBenefit.sups && currentBenefit.sups[yearIndex]) {
                // 分割值和上角标
                const baseValue = value.replace(currentBenefit.sups[yearIndex], '');
                const supValue = currentBenefit.sups[yearIndex];

                // 创建包含上角标的文本
                valueCell.innerHTML = `${baseValue}<sup class="sup">${supValue}</sup>`;
            } else {
                valueCell.textContent = value;
            }

            row.appendChild(valueCell);
        });
        tbody.appendChild(row);
    });

    table.appendChild(tbody);
    contentContainer.appendChild(table);
    container.appendChild(contentContainer);

    return container;
}

/**
 * 显示错误信息
 * @param {string} message 错误信息
 */
function showError(message) {
    const container = document.getElementById('cash-table-container1');
    container.innerHTML = '';
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error';
    errorDiv.textContent = `数据加载失败: ${message}`;
    container.appendChild(errorDiv);
}

// 存储表格数据
let tablePastData = null;
// 当前选中的福利类型索引（移动端使用）
let currentPastIndex = 0;
function getPastList(){
    https()
        .request({
            method: 'post',
            url: '/aisite-applyapi/hk/support/getPastDividend',
            data: {
                "productCode": state.selectProCode,//selectProCode
                "currency": selectPastCurrency,
                "region":region
            },
        }).then(res => {
        if(res.code==200){
            tablePastData = res.data;
            pastTable();

            // 添加窗口大小改变事件监听
            window.addEventListener('resize', handlePastResize);
        }
    })
        .catch(error => {
            // showError(error.message);
            console.log('error',error)
        });
}

// 窗口大小改变处理函数
function handlePastResize() {
    if (tablePastData) {
        pastTable();
    }
}

// 渲染表格（根据屏幕宽度自动选择PC或移动端样式）
function pastTable() {
    const container = document.getElementById('past-table-content');
    if(container){
       container.innerHTML = '';
   
    if (window.innerWidth > 953) {
        container.appendChild(createPastTable(tablePastData));
    } else {
        container.appendChild(createMobilePastTable(tablePastData));
    }
    }
}
/**
 * 创建保持原始格式的表格
 */
function createPastTable(data) {
    const pastTable = document.createElement('table');
    pastTable.className = 'benefit-table';

    // 创建表头
    const thead = document.createElement('thead');

    // 主标题行
    const mainHeaderRow = document.createElement('tr');
    const leftHeaderCell = document.createElement('th');
    leftHeaderCell.rowSpan = 2;
    leftHeaderCell.className = 'main-header';
    let lang = getSystemLanguageByBrowerUrl()
    if(lang === 'sc'){
        leftHeaderCell.textContent = '';
    } else if(lang === 'tc'){
        leftHeaderCell.textContent = '';
    } else {
        leftHeaderCell.textContent = '';
    }
    mainHeaderRow.appendChild(leftHeaderCell);

    const rightHeaderCell = document.createElement('th');
    rightHeaderCell.colSpan = 6;
    rightHeaderCell.className = 'main-header';
    rightHeaderCell.textContent = data.header.rightTitle;
    mainHeaderRow.appendChild(rightHeaderCell);
    thead.appendChild(mainHeaderRow);

    // 第一组年份标题行
    const yearHeaderRow1 = document.createElement('tr');
    data.years.slice(0, 6).forEach(year => {
        const cell = document.createElement('th');
        cell.className = 'year-header';
        cell.textContent = year;
        yearHeaderRow1.appendChild(cell);
    });
    thead.appendChild(yearHeaderRow1);

    pastTable.appendChild(thead);

    // 创建表体
    const tbody = document.createElement('tbody');

    // 定义处理数据组的函数
    const processDataGroup = (startIndex, endIndex, isFirstGroup) => {
        if (!isFirstGroup) {
            // 第二组年份标题行
            const yearHeaderRow = document.createElement('tr');
            const emptyCell = document.createElement('th');
            emptyCell.className = 'year-header';
            yearHeaderRow.appendChild(emptyCell);

            data.years.slice(startIndex, endIndex).forEach(year => {
                const cell = document.createElement('th');
                cell.className = 'year-header';
                cell.textContent = year;
                yearHeaderRow.appendChild(cell);
            });

            // 补充空单元格使总列数为6
            // while (yearHeaderRow.children.length < 6) {
            //     const cell = document.createElement('th');
            //     cell.className = 'year-header';
            //     yearHeaderRow.appendChild(cell);
            // }

            tbody.appendChild(yearHeaderRow);
        }

        // 处理数据行
        data.benefits.forEach(benefit => {
            const row = document.createElement('tr');
            const titleCell = document.createElement('td');
            titleCell.className = 'data-cell blue-text';
            titleCell.textContent = benefit.name;
            row.appendChild(titleCell);

            benefit.values.slice(startIndex, endIndex).forEach((value, i) => {
                const cell = document.createElement('td');
                cell.className = 'data-cell';

                // 检查是否有上角标
                const supIndex = startIndex + i;
                if (benefit.sups && benefit.sups[supIndex]) {
                    // 分割值和上角标
                    const baseValue = value.replace(benefit.sups[supIndex], '');
                    const supValue = benefit.sups[supIndex];

                    // 创建包含上角标的文本
                    cell.innerHTML = `${baseValue}<sup class="sup">${supValue}</sup>`;
                } else {
                    cell.textContent = value;
                }

                row.appendChild(cell);
            });

            // 补充空单元格使总列数为6
            // while (row.children.length < 6) {
            //     const cell = document.createElement('td');
            //     cell.className = 'data-cell';
            //     cell.textContent = "N/A*";
            //     row.appendChild(cell);
            // }

            tbody.appendChild(row);
        });
    };

    // 使用循环处理所有数据，每6个为一组
    const groupSize = 6;
    for (let i = 0; i < data.years.length; i += groupSize) {
        const isFirstGroup = i === 0;
        processDataGroup(i, i + groupSize, isFirstGroup);
    }

    pastTable.appendChild(tbody);
    return pastTable;
}

/**
 * 创建移动端表格
 * @param {Object} data 表格数据
 * @returns {HTMLElement} 表格DOM元素
 */
function createMobilePastTable(data) {
    // 创建主容器
    const container = document.createElement('div');
    container.className = 'mobile-table-container';

    // 创建标签页容器
    const tabContainer = document.createElement('div');
    tabContainer.className = 'tab-container';

    // 创建表格内容容器
    const contentContainer = document.createElement('div');
    contentContainer.className = 'content-container';

    // 创建表格（只创建一个）
    const table = document.createElement('table');
    table.className = 'table-content benefit-table';

    // 创建表头
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');

    const yearHeader = document.createElement('th');
    yearHeader.textContent = data.header.rightTitle;
    yearHeader.className = 'year-content';
    headerRow.appendChild(yearHeader);

    const valueHeader = document.createElement('th');
    valueHeader.className = 'year-content';

    // 创建福利类型显示元素
    const benefitType = document.createElement('div');
    benefitType.className = 'benefit-type';
    benefitType.textContent = data.benefits[currentPastIndex].name;

      // 主标题行
    const mainHeaderRow = document.createElement('tr');
    const leftHeaderCell = document.createElement('th');
    leftHeaderCell.rowSpan = 2;
    leftHeaderCell.className = 'main-header';
    let lang = getSystemLanguageByBrowerUrl()
    if(lang === 'sc'){
        leftHeaderCell.textContent = '';
    } else if(lang === 'tc'){
        leftHeaderCell.textContent = '';
    } else {
        leftHeaderCell.textContent = '';
    }
    valueHeader.appendChild(document.createTextNode('' ));
    valueHeader.appendChild(benefitType);

    headerRow.appendChild(valueHeader);
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // 创建表格内容
    const tbody = document.createElement('tbody');

    // 初始化表格内容（显示当前选中的福利类型的数据）
    data.years.forEach((year, yearIndex) => {
        const row = document.createElement('tr');

        // 年份单元格
        const yearCell = document.createElement('td');
        yearCell.textContent = year;
        row.appendChild(yearCell);

        // 值单元格
        const valueCell = document.createElement('td');
        const currentBenefit = data.benefits[currentPastIndex];
        const value = currentBenefit.values[yearIndex] || 'N/A*';

        // 检查是否有上角标
        if (currentBenefit.sups && currentBenefit.sups[yearIndex]) {
            // 分割值和上角标
            const baseValue = value.replace(currentBenefit.sups[yearIndex], '');
            const supValue = currentBenefit.sups[yearIndex];

            // 创建包含上角标的文本
            valueCell.innerHTML = `${baseValue}<sup class="sup">${supValue}</sup>`;
        } else {
            valueCell.textContent = value;
        }

        row.appendChild(valueCell);

        tbody.appendChild(row);
    });

    table.appendChild(tbody);
    contentContainer.appendChild(table);

    // 创建标签页
    data.benefits.forEach((benefit, index) => {
        const tab = document.createElement('div');
        tab.className = 'tab' + (index === currentPastIndex ? ' active' : '');
        tab.textContent = benefit.name;
        tab.dataset.index = index;

        // 标签点击事件
        tab.addEventListener('click', function() {
            // 更新当前选中的福利类型索引
            currentPastIndex = parseInt(this.dataset.index);

            // 重新渲染表格（会保持当前的PC/移动端样式）
            cashTable();
        });

        tabContainer.appendChild(tab);
    });

    container.appendChild(tabContainer);
    container.appendChild(contentContainer);

    return container;
}

/**
 * 显示错误信息
 * @param {string} message 错误信息
 */
function showError(message) {
    const container = document.getElementById('past-table-content');
    container.innerHTML = '';
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error';
    errorDiv.textContent = `数据加载失败: ${message}`;
    container.appendChild(errorDiv);
}

// 存储表格数据
let tablePastData1 = null;
// 当前选中的福利类型索引（移动端使用）
let currentPastIndex1 = 0;
function getPastList1(){
    https()
        .request({
            method: 'post',
            url: '/aisite-applyapi/hk/support/getPastDividend',
            data: {
                "productCode": state.selectProCode,
                "currency": selectPastCurrency,
                "region":region
            },
        }).then(res => {
        if(res.code==200){
            tablePastData1 = res.data;
            pastTable1();

            // 添加窗口大小改变事件监听
            window.addEventListener('resize', handlePastResize1);
        }
    })
        .catch(error => {
            // showError(error.message);
            console.log('error',error)
        });
}
// 窗口大小改变处理函数
function handlePastResize1() {
    if (tablePastData1) {
        pastTable1();
    }
}

// 渲染表格（根据屏幕宽度自动选择PC或移动端样式）
function pastTable1() {
    const container = document.getElementById('past-table-content1');
    if(container){
     container.innerHTML = '';

    if (window.innerWidth > 953) {
        container.appendChild(createPastTable1(tablePastData1));
    } else {
        container.appendChild(createMobilePastTable1(tablePastData1));
    }   
    }
    
}

/**
 * 创建保持原始格式的表格
 * @param {Object} data 表格数据
 * @returns {HTMLElement} 表格DOM元素
 */
function createPastTable1(data) {
    const pastTable1 = document.createElement('table');
    pastTable1.className = 'benefit-table';

    // 创建表头
    const thead = document.createElement('thead');

    // 主标题行
    const mainHeaderRow = document.createElement('tr');
    const leftHeaderCell = document.createElement('th');
    leftHeaderCell.rowSpan = 2;
    leftHeaderCell.className = 'main-header';
    let lang = getSystemLanguageByBrowerUrl()
    if(lang === 'sc'){
        leftHeaderCell.textContent = '';
    } else if(lang === 'tc'){
        leftHeaderCell.textContent = '';
    } else {
        leftHeaderCell.textContent = '';
    }
    mainHeaderRow.appendChild(leftHeaderCell);

    const rightHeaderCell = document.createElement('th');
    rightHeaderCell.colSpan = 6;
    rightHeaderCell.className = 'main-header';
    rightHeaderCell.textContent = data.header.rightTitle;
    mainHeaderRow.appendChild(rightHeaderCell);
    thead.appendChild(mainHeaderRow);

    // 第一组年份标题行
    const yearHeaderRow1 = document.createElement('tr');
    data.years.slice(0, 6).forEach(year => {
        const cell = document.createElement('th');
        cell.className = 'year-header';
        cell.textContent = year;
        yearHeaderRow1.appendChild(cell);
    });
    thead.appendChild(yearHeaderRow1);

    pastTable1.appendChild(thead);

    // 创建表体
    const tbody = document.createElement('tbody');

    // 定义处理数据组的函数
    const processDataGroup = (startIndex, endIndex, isFirstGroup) => {
        if (!isFirstGroup) {
            // 第二组年份标题行
            const yearHeaderRow = document.createElement('tr');
            const emptyCell = document.createElement('th');
            emptyCell.className = 'year-header';
            yearHeaderRow.appendChild(emptyCell);

            data.years.slice(startIndex, endIndex).forEach(year => {
                const cell = document.createElement('th');
                cell.className = 'year-header';
                cell.textContent = year;
                yearHeaderRow.appendChild(cell);
            });

            // 补充空单元格使总列数为6
            while (yearHeaderRow.children.length < 6) {
                const cell = document.createElement('th');
                cell.className = 'year-header';
                yearHeaderRow.appendChild(cell);
            }

            tbody.appendChild(yearHeaderRow);
        }

        // 处理数据行
        data.benefits.forEach(benefit => {
            const row = document.createElement('tr');
            const titleCell = document.createElement('td');
            titleCell.className = 'data-cell blue-text';
            titleCell.textContent = benefit.name;
            row.appendChild(titleCell);

            benefit.values.slice(startIndex, endIndex).forEach((value, i) => {
                const cell = document.createElement('td');
                cell.className = 'data-cell';

                // 检查是否有上角标
                const supIndex = startIndex + i;
                if (benefit.sups && benefit.sups[supIndex]) {
                    // 分割值和上角标
                    const baseValue = value.replace(benefit.sups[supIndex], '');
                    const supValue = benefit.sups[supIndex];

                    // 创建包含上角标的文本
                    cell.innerHTML = `${baseValue}<sup class="sup">${supValue}</sup>`;
                } else {
                    cell.textContent = value;
                }

                row.appendChild(cell);
            });

            // 补充空单元格使总列数为6
            // while (row.children.length < 6) {
            //     const cell = document.createElement('td');
            //     cell.className = 'data-cell';
            //     cell.textContent = "N/A*";
            //     row.appendChild(cell);
            // }

            tbody.appendChild(row);
        });
    };

    // 使用循环处理所有数据，每6个为一组
    const groupSize = 6;
    for (let i = 0; i < data.years.length; i += groupSize) {
        const isFirstGroup = i === 0;
        processDataGroup(i, i + groupSize, isFirstGroup);
    }

    pastTable1.appendChild(tbody);
    return pastTable1;
}

/**
 * 创建移动端表格
 * @param {Object} data 表格数据
 * @returns {HTMLElement} 表格DOM元素
 */
function createMobilePastTable1(data) {
    // 创建主容器
    const container = document.createElement('div');
    container.className = 'mobile-table-container';
    // 创建表格内容容器
    const contentContainer = document.createElement('div');
    contentContainer.className = 'content-container';

    // 创建表格（只创建一个）
    const table = document.createElement('table');
    table.className = 'table-content benefit-table';

    // 创建表头
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');

    const yearHeader = document.createElement('th');
    yearHeader.textContent = data.header.rightTitle;
    yearHeader.className = 'year-content';
    headerRow.appendChild(yearHeader);

    const valueHeader = document.createElement('th');
    valueHeader.className = 'year-content';

    // 创建福利类型显示元素
    data.benefits.forEach(benefit => {
        const benefitHeader = document.createElement('th');
        benefitHeader.textContent = benefit.name;
        benefitHeader.className = 'year-content';
        headerRow.appendChild(benefitHeader);
    });
    // headerRow.appendChild(valueHeader);
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // 创建表格内容
    const tbody = document.createElement('tbody');

    // 初始化表格内容（显示当前选中的福利类型的数据）
    data.years.forEach((year, yearIndex) => {
        const row = document.createElement('tr');

        // 年份单元格
        const yearCell = document.createElement('td');
        yearCell.textContent = year;
        row.appendChild(yearCell);

        // 值单元格
        data.benefits.forEach(benefit => {
            const valueCell = document.createElement('td');
            const currentBenefit = data.benefits[currentPastIndex1];
            const value = currentBenefit.values[yearIndex] || 'N/A*';

            // 检查是否有上角标
            if (currentBenefit.sups && currentBenefit.sups[yearIndex]) {
                // 分割值和上角标
                const baseValue = value.replace(currentBenefit.sups[yearIndex], '');
                const supValue = currentBenefit.sups[yearIndex];

                // 创建包含上角标的文本
                valueCell.innerHTML = `${baseValue}<sup class="sup">${supValue}</sup>`;
            } else {
                valueCell.textContent = value;
            }

            row.appendChild(valueCell);
        });
        tbody.appendChild(row);
    });

    table.appendChild(tbody);
    contentContainer.appendChild(table);
    container.appendChild(contentContainer);

    return container;
}

/**
 * 显示错误信息
 * @param {string} message 错误信息
 */
function showError(message) {
    const container = document.getElementById('past-table-content1');
    container.innerHTML = '';
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error';
    errorDiv.textContent = `数据加载失败: ${message}`;
    container.appendChild(errorDiv);
}