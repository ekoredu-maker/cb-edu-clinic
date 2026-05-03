export const tabs = [
  { id: 'settings', label: '1. 설정' },
  { id: 'supporters', label: '2. 지원단' },
  { id: 'students', label: '3. 학생' },
  { id: 'matching', label: '4. 매칭' },
  { id: 'sessions', label: '5. 활동/검증' },
  { id: 'training', label: '6. 연수' },
  { id: 'documents', label: '7. 서식' },
  { id: 'statistics', label: '8. 통계' },
  { id: 'validation', label: '9. 점검' }
];

let activeTab = 'settings';

export function getActiveTab() {
  return activeTab;
}

export function setActiveTab(id) {
  activeTab = tabs.some((tab) => tab.id === id) ? id : 'settings';
  if (location.hash !== `#${activeTab}`) location.hash = activeTab;
}

export function resolveInitialTab() {
  const id = location.hash.replace('#', '');
  activeTab = tabs.some((tab) => tab.id === id) ? id : 'settings';
  return activeTab;
}
