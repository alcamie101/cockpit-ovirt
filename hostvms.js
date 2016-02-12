// --- vms-screen -------------------------------------------------------
// latest parsed&successful VDSM's getAllVmStats() result
var latestHostVMSList = "";

var vdsmDataVmsList = ""; // might be partial output from the VDSM process
function vdsmOutput(data) {
    vdsmDataVmsList += data;
    debugMsg("vdsmOutput: <code>" + vdsmDataVmsList + "</code>");
}

function readVmsList() {// invoke VDSM to get fresh vms data from the host
    spawnVdsm("getAllVmStats", null, vdsmOutput, getAllVmStatsSuccess);
    vdsmDataVmsList = "";
}

function getAllVmStatsSuccess() {
    var vms = parseVdsmJson(vdsmDataVmsList);
    if (vms != null) {
        if (vms.status.code == 0) {
            latestHostVMSList = vms; // cache for reuse i.e. in displayVMDetail()
            renderHostVms(vms);
        } else {
            printError("getAllVmStats() error (" + vms.status.code + "): " + vms.status.message);
        }
    }
}

function renderHostVms(vmsFull) {
    // the 'vmsFull' is parsed json result of getAllVmStats()
    if (vmsFull.hasOwnProperty('items') && vmsFull.items.length > 0) {
        vmUsage = {};// using pie chart, no history needed
        var vms = [];

        // prepare data
        vmsFull.items.forEach(function translate(srcVm) {
            var vm = _getVmDetails(srcVm);
            vms.push(vm);

            var diskRead = getVmDeviceRate(vm, 'disks', 'readRate');
            var diskWrite = getVmDeviceRate(vm, 'disks', 'writeRate');
            var netRx = getVmDeviceRate(vm, 'network', 'rxRate');
            var netTx = getVmDeviceRate(vm, 'network', 'txRate');
            addVmUsage(vm.id, parseFloat(vm.cpuUser), parseFloat(vm.cpuSys), parseFloat(vm.memUsage),
                diskRead, diskWrite, netRx, netTx);
        });

        // render vms list from template
        var data = {units: vms};
        var template = $("#vms-list-templ").html();
        var html = Mustache.to_html(template, data);
        $("#virtual-machines-list").html(html);
        $("#virtual-machines-novm-message").hide();


        refreshUsageCharts();
        renderVmDetailActual();
    } else {
        $("#virtual-machines-list").html("");
        $("#virtual-machines-novm-message").show();
    }
}

function getVmDeviceRate(vm, device, rateName) {
    var total = 0.0;
    if (vm.hasOwnProperty(device)) {
        vm[device].forEach(function (d) {
            if (d.hasOwnProperty(rateName)) {
                var rate = parseFloat(d[rateName]);
                total += rate;
            }
        });

    }
    return total;
}

function onVmClick(vmId) {// show vm detail
    goTo('/vm/' + vmId);
}

// --- vms-screen usage charts ------------------------------------------
function addVmUsage(vmId, cpuUser, cpuSys, mem, diskRead, diskWrite, netRx, netTx) {
    var record = {
        cpuUser: cpuUser,
        cpuSys: cpuSys,
        memory: mem,
        diskRead: diskRead,
        diskWrite: diskWrite,
        netRx: netRx,
        netTx: netTx
    };

    vmUsage[vmId] = record; // for pie chart do not keep history
}

function normalizePercentage(value) {
    return Math.min(Math.max(parseFloat(value), 0.0), 1.0);
}

function getUsageChart(device, vmId) {
    var deviceId = "#" + device + "UsageChart-" + vmId;
    if ($(deviceId) == null || $(deviceId).get(0) == null) {
        return null;
    }

    var ctx = $(deviceId).get(0).getContext("2d");
    var myChart = new Chart(ctx);
    return myChart;
}

function refreshUsageCharts() {
    var chartOptions = {
        animateRotate:false,
        animateScale: false
    };
    $.each(vmUsage, function (key, usageRecord) {
        // CPU
        var myChart = getUsageChart("cpu", key);
        if (myChart != null) {
            var user = normalizePercentage(usageRecord.cpuUser);
            var sys = normalizePercentage(usageRecord.cpuSys);
            var idle = 1.0 - Math.min(user + sys, 1.0);
            myChart.Doughnut([
                {
                    value: user,
                    color: "#46BFBD",
                    highlight: "#5AD3D1"
                },
                {
                    value: sys,
                    color: "#F7464A",
                    highlight: "#FF5A5E"
                },
                {
                    value: idle,
                    color: "#33FF33",
                    highlight: "#33FF99"
                }
            ], chartOptions);
        }

        // Memory
        var myChart = getUsageChart("mem", key);
        if (myChart != null) {
            var used = normalizePercentage(usageRecord.memory);
            var free = 1.0 - used;
            myChart.Doughnut([
                {
                    value: used,
                    color: "#46BFBD",
                    highlight: "#5AD3D1"
                },
                {
                    value: free,
                    color: "#33FF33",
                    highlight: "#33FF99"
                }
            ], chartOptions);
        }

        // Disk IO
        var myChart = getUsageChart("diskio", key);
        if (myChart != null) {
            var r = normalizePercentage(usageRecord.diskRead);
            var w = normalizePercentage(usageRecord.diskWrite);
            var idle = 1.0 - Math.min(r + w, 1.0);
            myChart.Doughnut([
                {
                    value: r,
                    color: "#46BFBD",
                    highlight: "#5AD3D1"
                },
                {
                    value: w,
                    color: "#F7464A",
                    highlight: "#FF5A5E"
                },
                {
                    value: idle,
                    color: "#33FF33",
                    highlight: "#33FF99"
                }
            ], chartOptions);
        }

        // Network IO
        var myChart = getUsageChart("networkio", key);
        if (myChart != null) {
            var r = normalizePercentage(usageRecord.netRx);
            var w = normalizePercentage(usageRecord.netTx);
            var idle = 1.0 - Math.min(r + w, 1.0);
            myChart.Doughnut([
                {
                    value: r,
                    color: "#46BFBD",
                    highlight: "#5AD3D1"
                },
                {
                    value: w,
                    color: "#F7464A",
                    highlight: "#FF5A5E"
                },
                {
                    value: idle,
                    color: "#33FF33",
                    highlight: "#33FF99"
                }
            ], chartOptions);
        }
    });
}

// ----------------------------------------------------------------------
function _getVmDetails(src) { // src is one item from parsed getAllVmStats
    var vm = {
        id: src.vmId,
        name: src.vmName,
        guestIPs: src.guestIPs,
        status: src.status,
        guestFQDN: src.guestFQDN,
        username: src.username,

        displayType: src.displayType,
        displayIp: src.displayIp,
        displayPort: src.displayPort,
        displayInfo: src.displayInfo,

        appsList: src.appsList,

        memUsage: src.memUsage,
        cpuUser: src.cpuUser,
        elapsedTime: src.elapsedTime,
        cpuSys: src.cpuSys,
        vcpuPeriod: src.vcpuPeriod,
        vcpuQuota: src.vcpuQuota,
        guestCPUCount: src.guestCPUCount,

        vmType: src.vmType,
        kvmEnable: src.kvmEnable,
        acpiEnable: src.acpiEnable,
    };
    return vm;
}