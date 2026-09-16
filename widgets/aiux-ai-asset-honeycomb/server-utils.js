// Extrapolated from the 10 sample rows provided for the AI Control Tower POC.
// Used only when the real sn_ai_governance_asset_governance_details query returns
// zero rows (e.g. this instance has no governed assets loaded yet), so the
// showcase widget still renders a realistic ~300-asset inventory.

var SOURCE_SYSTEMS = [
  {
    name: 'Google Vertex AI',
    share: 0.44,
    nameTemplates: [
      'Google AI Summary and Automated Reporting Agent - Customer {n}',
      'Storefront Concierge Bot {n}',
      'Price Quote Agent {n}',
      'Vertex Support Assistant {n}',
      'Customer Insights Agent {n}',
      'Return Policy Agent {n}',
      'Vertex RAG Pipeline {n}',
      'Promotions Recommender {n}'
    ],
    riskWeights: {High: 0.15, Medium: 0.55, Low: 0.2, 'To be determined': 0.1}
  },
  {
    name: 'Amazon Bedrock',
    share: 0.32,
    nameTemplates: [
      'agent-quick-start-wht{n} DRAFT',
      'test-agent-{n}',
      'killswitch-agent-{n} DRAFT',
      'bedrock-fraud-detector-{n}',
      'claim-intake-agent-{n}',
      'inventory-forecast-agent-{n}',
      'returns-triage-agent-{n}'
    ],
    riskWeights: {High: 0.05, Medium: 0.15, Low: 0.4, 'To be determined': 0.4}
  },
  {
    name: 'Azure Foundry',
    share: 0.24,
    nameTemplates: [
      'SharePoint-Test-Agent {n}',
      'text-embedding-3-small {n}',
      'text-embedding-3-large {n}',
      'SecurePolicyAgent - {n}',
      'Foundry Support Bot {n}',
      'PolicyAgent - {n}'
    ],
    riskWeights: {High: 0.05, Medium: 0.7, Low: 0.15, 'To be determined': 0.1}
  }
];

// Six of these against four palette slots deliberately exercises the
// "fold the rest into Other" path in the Department colour mode.
var DEPARTMENT_WEIGHTS = {
  'Customer Support': 0.3,
  Merchandising: 0.22,
  'Supply Chain': 0.18,
  Finance: 0.12,
  'Human Resources': 0.1,
  Legal: 0.08
};

var STATE_STATUS_PAIRS = [
  {state: 'Deployed', status: 'In review', weight: 0.4},
  {state: 'Deployed', status: 'Approved', weight: 0.15},
  {state: 'Design', status: 'In review', weight: 0.25},
  {state: 'Design', status: 'Needs remediation', weight: 0.05},
  {state: '', status: '', weight: 0.15}
];

function weightedPick(weightMap) {
  var entries = Object.keys(weightMap).map(function (key) {
    return {key: key, weight: weightMap[key]};
  });
  var total = entries.reduce(function (sum, e) {
    return sum + e.weight;
  }, 0);
  var roll = Math.random() * total;
  var cumulative = 0;
  for (var i = 0; i < entries.length; i++) {
    cumulative += entries[i].weight;
    if (roll <= cumulative) return entries[i].key;
  }
  return entries[entries.length - 1].key;
}

function weightedPickFromList(list) {
  var total = list.reduce(function (sum, item) {
    return sum + item.weight;
  }, 0);
  var roll = Math.random() * total;
  var cumulative = 0;
  for (var i = 0; i < list.length; i++) {
    cumulative += list[i].weight;
    if (roll <= cumulative) return list[i];
  }
  return list[list.length - 1];
}

function inherentRiskFor(riskClassification) {
  if (riskClassification === 'To be determined') {
    return {label: 'TBD (0)', score: 0};
  }
  var band =
    riskClassification === 'High'
      ? [6, 9.9]
      : riskClassification === 'Medium'
        ? [3, 5.99]
        : [0.5, 2.99];
  var score = band[0] + Math.random() * (band[1] - band[0]);
  var rounded = Math.round(score * 100) / 100;
  var label =
    rounded >= 6
      ? 'High'
      : rounded >= 3
        ? 'Medium'
        : rounded > 0
          ? 'Low'
          : 'TBD';
  return {label: label + ' (' + rounded.toFixed(2) + ')', score: rounded};
}

function buildName(template, n) {
  return template.replace('{n}', n);
}

export function generateMockAssets(targetCount) {
  var total = targetCount || 300;
  var assets = [];
  var counters = {};

  SOURCE_SYSTEMS.forEach(function (system) {
    var count = Math.round(total * system.share);
    counters[system.name] = 0;

    for (var i = 0; i < count; i++) {
      counters[system.name] += 1;
      var n = counters[system.name];
      var template =
        system.nameTemplates[
          Math.floor(Math.random() * system.nameTemplates.length)
        ];
      var riskClassification = weightedPick(system.riskWeights);
      var inherentRisk = inherentRiskFor(riskClassification);
      var stateStatus = weightedPickFromList(STATE_STATUS_PAIRS);

      assets.push({
        name: buildName(template, n),
        sourceSystem: system.name,
        department: weightedPick(DEPARTMENT_WEIGHTS),
        riskClassification: riskClassification,
        inherentRisk: inherentRisk.label,
        state: stateStatus.state,
        status: stateStatus.status
      });
    }
  });

  return assets;
}
