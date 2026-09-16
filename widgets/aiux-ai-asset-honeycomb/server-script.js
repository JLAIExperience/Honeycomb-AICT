import {generateMockAssets} from './server-utils.js';

// Confirmed against the live schema of sn_ai_governance_asset_governance_details:
// - "Asset" display name and "Source system" both live on the referenced
//   alm_ai_digital_asset record (via the `asset` reference field), not on
//   this table directly.
// - "Risk classification" is the `risk_score` choice field — its display
//   value is already the label we want ("High"/"Medium"/"Low"/"To be
//   determined"), not the underlying (and non-monotonic) integer.
// - "Inherent risk" (`inherent_risk_rating`) is a pre-formatted string,
//   e.g. "Medium (Score: 3.00)" — used as-is.
export default function server(data, _options, _input) {
  try {
    var rows = [];
    var assetSysIds = [];

    var gr = new GlideRecordSecure('sn_ai_governance_asset_governance_details');
    // `governed` is the "Managed status" flag — only managed assets belong in
    // this inventory. Without it the table also returns unmanaged records.
    gr.addQuery('governed', true);
    gr.setLimit(500);
    gr.query();

    while (gr.next()) {
      var assetSysId = gr.getValue('asset');
      if (assetSysId) assetSysIds.push(assetSysId);
      rows.push({
        // The governance record's own id — this is what the AI Control Tower
        // inventory page is keyed on, not the `asset` reference's id.
        sysId: gr.getUniqueValue(),
        assetSysId: assetSysId,
        name: gr.getDisplayValue('asset'),
        riskClassification: gr.getDisplayValue('risk_score'),
        inherentRisk: gr.getValue('inherent_risk_rating'),
        state: gr.getDisplayValue('asset_state'),
        status: gr.getDisplayValue('asset_status')
      });
    }

    // Batch-resolve source_system from the referenced asset records instead
    // of dot-walking (`asset.source_system`) inside the loop above — avoids
    // an N+1 reference lookup across up to 500 rows.
    // `department` is a best guess: ALM asset tables conventionally carry one
    // (a cmn_department reference), but it was not in the confirmed field
    // list for this table. An unrecognised name returns empty rather than
    // throwing, so the Department colour mode degrades to "Not set" instead
    // of breaking if the real field is named differently.
    var assetDetailsById = {};
    if (assetSysIds.length > 0) {
      var assetGr = new GlideRecordSecure('alm_ai_digital_asset');
      assetGr.addQuery('sys_id', 'IN', assetSysIds.join(','));
      assetGr.setLimit(assetSysIds.length);
      assetGr.query();
      while (assetGr.next()) {
        assetDetailsById[assetGr.getUniqueValue()] = {
          sourceSystem: assetGr.getDisplayValue('source_system'),
          department: assetGr.getDisplayValue('department')
        };
      }
    }

    var assets = rows.map(function (row) {
      var details = assetDetailsById[row.assetSysId] || {};
      return {
        sysId: row.sysId,
        name: row.name,
        sourceSystem: details.sourceSystem || '',
        department: details.department || '',
        riskClassification: row.riskClassification,
        inherentRisk: row.inherentRisk,
        state: row.state,
        status: row.status
      };
    });

    // The query above is capped, and the cap is not risk-aware — it takes
    // whatever the default order returns. Reporting the true total lets the
    // widget say so, rather than presenting a partial slice as the whole
    // inventory (and silently hiding, say, every High-risk asset that falls
    // beyond the cutoff). GlideAggregate rather than getRowCount(), which
    // would pull every row into memory.
    var totalAvailable = assets.length;
    var countGr = new GlideAggregate('sn_ai_governance_asset_governance_details');
    countGr.addAggregate('COUNT');
    // Must carry the same `governed` filter as the query above, or the
    // "showing X of N" comparison comes out wrong by counting the unmanaged
    // rows the widget deliberately leaves out.
    countGr.addQuery('governed', true);
    countGr.query();
    if (countGr.next()) {
      totalAvailable = parseInt(countGr.getAggregate('COUNT'), 10);
    }

    data.isMockData = assets.length === 0;
    data.assets = data.isMockData ? generateMockAssets(300) : assets;
    data.total = data.assets.length;
    data.totalAvailable = data.isMockData ? data.assets.length : totalAvailable;
    data.hasMore = data.totalAvailable > data.total;
  } catch (e) {
    gs.error('aiux-ai-asset-honeycomb server: ' + e.message);
    data.isError = true;
    data.errorMessage =
      gs.getMessage('Failed to load AI governance assets') + ': ' + e.message;
  }
}
