/**
 * Ingestion sonrası yan etkiler (worker: kalıcı yazımdan sonra kural değerlendirmesi).
 * Tam use-case: `evaluateAlertRulesUseCase` + altyapı bağlayıcıları `services/rule-engine`.
 */
export { evaluateAlertRulesUseCase as evaluateRulesAfterPersistedEvent } from "../use-cases/evaluate-alert-rules";
