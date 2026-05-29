import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSpellStore } from '../../stores/useSpellStore';
import { useProjectStore } from '../../stores/useProjectStore';
import type { SpellEntity, SpellEntityType } from '../../app/types/maestro';

const ENTITY_TYPE_META: Record<SpellEntityType, { label: string; icon: string }> = {
  maestro:         { label: 'Maestro',         icon: '🎼' },
  skill:           { label: 'Skills',          icon: '⚡' },
  'team-member':   { label: 'Team Members',    icon: '👤' },
  task:            { label: 'Tasks',            icon: '☐' },
  doc:             { label: 'Documents',        icon: '📄' },
  session:         { label: 'Sessions',         icon: '▶' },
  'custom-prompt': { label: 'Custom Prompts',   icon: '✎' },
};

const ENTITY_TYPES: SpellEntityType[] = ['maestro', 'skill', 'team-member', 'task', 'doc', 'session', 'custom-prompt'];
const CREATABLE_TYPES: SpellEntityType[] = ['maestro', 'custom-prompt'];

export const SpellPicker = React.memo(function SpellPicker() {
  const isOpen = useSpellStore((s) => s.isPickerOpen);
  const targetSessionId = useSpellStore((s) => s.targetSessionId);
  const entities = useSpellStore((s) => s.entities);
  const entitiesByType = useSpellStore((s) => s.entitiesByType);
  const activeEntityType = useSpellStore((s) => s.activeEntityType);
  const recentSpells = useSpellStore((s) => s.recentSpells);
  const invoking = useSpellStore((s) => s.invoking);
  const isCreating = useSpellStore((s) => s.isCreating);
  const createEntityType = useSpellStore((s) => s.createEntityType);
  const createSaving = useSpellStore((s) => s.createSaving);
  const editingEntityId = useSpellStore((s) => s.editingEntityId);
  const editInitialValues = useSpellStore((s) => s.editInitialValues);
  const closePicker = useSpellStore((s) => s.closePicker);
  const setActiveEntityType = useSpellStore((s) => s.setActiveEntityType);
  const invokeSpell = useSpellStore((s) => s.invokeSpell);
  const startCreating = useSpellStore((s) => s.startCreating);
  const startEditing = useSpellStore((s) => s.startEditing);
  const cancelCreating = useSpellStore((s) => s.cancelCreating);
  const saveSpellEntity = useSpellStore((s) => s.saveSpellEntity);
  const deleteSpellEntity = useSpellStore((s) => s.deleteSpellEntity);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);

  const [expandedEntityId, setExpandedEntityId] = useState<string | null>(null);

  // Create form state
  const [formName, setFormName] = useState('');
  const [formIcon, setFormIcon] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formContent, setFormContent] = useState('');

  // Reset form when creating starts, or prefill with initial values when editing
  useEffect(() => {
    if (isCreating) {
      setFormName(editInitialValues?.name ?? '');
      setFormIcon(editInitialValues?.icon ?? '');
      setFormDescription(editInitialValues?.description ?? '');
      setFormContent(editInitialValues?.content ?? '');
    }
  }, [isCreating, editInitialValues]);

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (isCreating) {
          cancelCreating();
        } else {
          closePicker();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, isCreating, closePicker, cancelCreating]);

  // Filter entities by type
  const filteredEntities = useMemo(() => {
    return activeEntityType === 'all' ? entities : (entitiesByType[activeEntityType] ?? []);
  }, [entities, entitiesByType, activeEntityType]);

  // Group by type for "all" view
  const groupedEntities = useMemo(() => {
    if (activeEntityType !== 'all') return null;
    const groups: Partial<Record<SpellEntityType, SpellEntity[]>> = {};
    for (const entity of filteredEntities) {
      if (!groups[entity.type]) groups[entity.type] = [];
      groups[entity.type]!.push(entity);
    }
    return groups;
  }, [filteredEntities, activeEntityType]);

  if (!isOpen || !targetSessionId) return null;

  const canCreate = activeEntityType !== 'all' && CREATABLE_TYPES.includes(activeEntityType as SpellEntityType);

  const handleInvoke = (entity: SpellEntity, spellName: string) => {
    invokeSpell({
      entityType: entity.type,
      entityId: entity.id,
      spellName,
      targetSessionId,
      projectId: activeProjectId,
    });
  };

  const handleSave = () => {
    if (!formName.trim() || !formContent.trim() || !createEntityType) return;
    saveSpellEntity({
      name: formName.trim(),
      content: formContent.trim(),
      description: formDescription.trim() || undefined,
      icon: formIcon.trim() || undefined,
      entityType: createEntityType,
    });
  };

  const handleDelete = (e: React.MouseEvent, entityId: string) => {
    e.stopPropagation();
    deleteSpellEntity(entityId);
  };

  const handleEdit = (e: React.MouseEvent, entity: SpellEntity) => {
    e.stopPropagation();
    startEditing(entity.id, entity.type);
  };

  const isDefault = (entity: SpellEntity) => entity.id.startsWith('default_') || entity.metadata?.isDefault;

  const renderEntity = (entity: SpellEntity) => {
    const isExpanded = expandedEntityId === entity.id;
    const hasMultipleSpells = entity.spells.length > 1;
    const entityIsDefault = isDefault(entity);
    const isUserCustom = !entityIsDefault && (entity.type === 'maestro' || entity.type === 'custom-prompt');
    const canDelete = isUserCustom;
    const canEdit = isUserCustom;

    return (
      <div key={entity.id} className="spellPicker__entity">
        <button
          type="button"
          className="spellPicker__entityRow"
          onClick={() => {
            if (hasMultipleSpells) {
              setExpandedEntityId(isExpanded ? null : entity.id);
            } else {
              handleInvoke(entity, entity.spells[0]?.name ?? 'void');
            }
          }}
          disabled={invoking}
        >
          <span className="spellPicker__entityIcon">{entity.icon ?? ENTITY_TYPE_META[entity.type].icon}</span>
          <span className="spellPicker__entityLabel">{entity.label}</span>
          {entityIsDefault && <span className="spellPicker__defaultBadge">DEFAULT</span>}
          <span className="spellPicker__entityType">{ENTITY_TYPE_META[entity.type].label}</span>
          {hasMultipleSpells && (
            <span className="spellPicker__entityExpand">{isExpanded ? '▴' : '▾'}</span>
          )}
          {canEdit && (
            <span
              className="spellPicker__entityEdit"
              onClick={(e) => handleEdit(e, entity)}
              title="Edit"
            >
              ✎
            </span>
          )}
          {canDelete && (
            <span
              className="spellPicker__entityDelete"
              onClick={(e) => handleDelete(e, entity.id)}
              title="Delete"
            >
              ×
            </span>
          )}
        </button>

        {/* Expanded spell list */}
        {isExpanded && hasMultipleSpells && (
          <div className="spellPicker__spellList">
            {entity.spells.map((spell) => (
              <button
                key={spell.name}
                type="button"
                className="spellPicker__spellRow"
                onClick={() => handleInvoke(entity, spell.name)}
                disabled={invoking}
                title={spell.description}
              >
                <span className="spellPicker__spellName">{spell.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderCreateForm = () => (
    <div className="spellPicker__createForm">
      <div className="spellPicker__formHeader">
        {editingEntityId ? 'Edit Spell' : 'New Spell'}
      </div>
      <div className="spellPicker__formField">
        <label className="spellPicker__formLabel">Name *</label>
        <input
          className="spellPicker__formInput"
          placeholder="e.g. My Custom Prompt"
          value={formName}
          onChange={(e) => setFormName(e.target.value)}
          autoFocus
        />
      </div>
      <div className="spellPicker__formField">
        <label className="spellPicker__formLabel">Icon</label>
        <input
          className="spellPicker__formInput spellPicker__formInput--icon"
          placeholder="emoji"
          value={formIcon}
          onChange={(e) => setFormIcon(e.target.value)}
          maxLength={4}
        />
      </div>
      <div className="spellPicker__formField">
        <label className="spellPicker__formLabel">Description</label>
        <input
          className="spellPicker__formInput"
          placeholder="Brief description (optional)"
          value={formDescription}
          onChange={(e) => setFormDescription(e.target.value)}
        />
      </div>
      <div className="spellPicker__formField">
        <label className="spellPicker__formLabel">Content *</label>
        <textarea
          className="spellPicker__formTextarea"
          placeholder="The prompt content..."
          value={formContent}
          onChange={(e) => setFormContent(e.target.value)}
          rows={5}
        />
      </div>
      <div className="spellPicker__formActions">
        <button
          type="button"
          className="spellPicker__formBtnCancel"
          onClick={cancelCreating}
          disabled={createSaving}
        >
          Cancel
        </button>
        <button
          type="button"
          className="spellPicker__formBtnSave"
          onClick={handleSave}
          disabled={createSaving || !formName.trim() || !formContent.trim()}
        >
          {createSaving ? 'Saving...' : editingEntityId ? 'Update' : 'Save'}
        </button>
      </div>
    </div>
  );

  return createPortal(
    <>
      {/* Backdrop */}
      <div className="spellPicker__backdrop" onClick={closePicker} />

      {/* Picker modal */}
      <div className="spellPicker">
        {/* Header */}
        <div className="spellPicker__header">
          <span className="spellPicker__title">✦ Cast Spell</span>
          <button type="button" className="spellPicker__close" onClick={closePicker}>×</button>
        </div>

        {/* Type tabs + New button */}
        <div className="spellPicker__tabs">
          <button
            type="button"
            className={`spellPicker__tab ${activeEntityType === 'all' ? 'spellPicker__tab--active' : ''}`}
            onClick={() => setActiveEntityType('all')}
          >
            All
          </button>
          {ENTITY_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              className={`spellPicker__tab ${activeEntityType === type ? 'spellPicker__tab--active' : ''}`}
              onClick={() => setActiveEntityType(type)}
            >
              {ENTITY_TYPE_META[type].icon} {ENTITY_TYPE_META[type].label}
            </button>
          ))}
          {canCreate && !isCreating && (
            <button
              type="button"
              className="spellPicker__createBtn"
              onClick={() => startCreating(activeEntityType as SpellEntityType)}
              title={`Create new ${ENTITY_TYPE_META[activeEntityType as SpellEntityType].label}`}
            >
              + New
            </button>
          )}
        </div>

        {/* Entity list or create form */}
        <div className="spellPicker__list">
          {isCreating ? renderCreateForm() : (
            <>
              {/* Recent spells section */}
              {activeEntityType === 'all' && recentSpells.length > 0 && (
                <div className="spellPicker__section">
                  <div className="spellPicker__sectionHeader">Recent</div>
                  {recentSpells.slice(0, 3).map((recent, i) => {
                    const entity = entities.find(e => e.id === recent.entityId);
                    if (!entity) return null;
                    return (
                      <button
                        key={`recent-${i}`}
                        type="button"
                        className="spellPicker__entityRow spellPicker__entityRow--recent"
                        onClick={() => handleInvoke(entity, recent.spellName)}
                        disabled={invoking}
                      >
                        <span className="spellPicker__entityIcon">{entity.icon ?? ENTITY_TYPE_META[entity.type].icon}</span>
                        <span className="spellPicker__entityLabel">{entity.label}</span>
                        {recent.spellName !== 'void' && (
                          <span className="spellPicker__spellBadge">{recent.spellName}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Grouped view (all tab) */}
              {groupedEntities && Object.entries(groupedEntities).map(([type, typeEntities]) => (
                <div key={type} className="spellPicker__section">
                  <div className="spellPicker__sectionHeader">
                    {ENTITY_TYPE_META[type as SpellEntityType].icon} {ENTITY_TYPE_META[type as SpellEntityType].label}
                  </div>
                  {typeEntities.map(renderEntity)}
                </div>
              ))}

              {/* Flat view (specific tab) */}
              {!groupedEntities && filteredEntities.map(renderEntity)}

              {/* Empty state */}
              {filteredEntities.length === 0 && (
                <div className="spellPicker__empty">
                  No spell entities available
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
});
