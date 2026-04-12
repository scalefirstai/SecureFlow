# Test Cases: ReportGen MCP

## TC-RG-001: generate_weekly_report - Generate HTML report
- **Precondition**: Mock upstream returns SLA violations, delta, hotspots
- **Expected**: reportId set, HTML file exists on disk, verdict contains "ACTION REQUIRED"
- **Status**: PASS

## TC-RG-002: generate_weekly_report - Store in database
- **Expected**: reports table has 1 row after generation
- **Status**: PASS

## TC-RG-003: generate_weekly_report - Handle upstream failures
- **Precondition**: All upstream MCPs throw errors
- **Expected**: Report still generated (partial), verdict="ALL CLEAR"
- **Status**: PASS

## TC-RG-004: get_report_history - Return report list
- **Precondition**: 2 reports generated
- **Expected**: reports.length=2
- **Status**: PASS

## TC-RG-005: get_report_history - Empty when no reports
- **Expected**: reports.length=0
- **Status**: PASS

## TC-RG-006: get_report - Retrieve HTML content
- **Expected**: content contains "Vulnerability Governance Report"
- **Status**: PASS

## TC-RG-007: get_report - Error for missing report
- **Expected**: error=REPORT_NOT_FOUND
- **Status**: PASS

## TC-RG-008: customize_template - Update sections
- **Input**: sections=["traffic_light","sla_violations"]
- **Expected**: updated=true, templateVersion incremented
- **Status**: PASS

## TC-RG-009: renderReport - Render valid HTML
- **Expected**: HTML contains report title, week, verdict, fleet data
- **Status**: PASS
