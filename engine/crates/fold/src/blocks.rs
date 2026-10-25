use std::collections::BTreeMap;

use engine_batch::document::Role;

use crate::identity::Rat;
use crate::inputs::{BlockField, BlockMode, BlockRole, ReaderVersion, ReadingBlock};
use crate::report::BlockedCounts;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum FieldState {
    #[default]
    Plain,
    Held(i16),
    Dropped(i16),
}

impl FieldState {
    fn reached_by(self, block: &ReadingBlock, field: BlockField) -> Self {
        let can_hold = matches!(field, BlockField::Pci | BlockField::Channel | BlockField::AreaCode | BlockField::Bandwidth);
        match (self, block.mode) {
            (Self::Dropped(_), _) => self,
            (_, BlockMode::Drop) => Self::Dropped(block.id),
            (Self::Plain, BlockMode::Corroborate) if can_hold => Self::Held(block.id),
            _ => self,
        }
    }

    pub fn is_dropped(self) -> bool {
        matches!(self, Self::Dropped(_))
    }

    pub fn is_held(self) -> bool {
        matches!(self, Self::Held(_))
    }

    pub fn keep<T>(self, value: Option<T>) -> Option<T> {
        if self.is_dropped() { None } else { value }
    }

    pub fn count(self, value_present: bool, counts: &mut BTreeMap<i16, BlockedCounts>) {
        if !value_present {
            return;
        }
        match self {
            Self::Plain => {}
            Self::Held(block) => counts.entry(block).or_default().held += 1,
            Self::Dropped(block) => counts.entry(block).or_default().dropped += 1,
        }
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub struct BlockedFields {
    pub pci: FieldState,
    pub channel: FieldState,
    pub area_code: FieldState,
    pub bandwidth: FieldState,
    pub timing_advance: FieldState,
    pub signal: FieldState,
}

fn block_role(role: Role) -> BlockRole {
    match role {
        Role::Serving | Role::Aggregated => BlockRole::Serving,
        Role::Neighbour => BlockRole::Neighbour,
        Role::NrSecondary => BlockRole::Nsa,
    }
}

fn reaches_reader(block: &ReadingBlock, reader: &ReaderVersion) -> bool {
    block.reader_version.as_ref().is_none_or(|version| version == reader)
}

pub fn whole_reading_block<'a>(blocks: &'a [ReadingBlock], reader: &ReaderVersion) -> Option<&'a ReadingBlock> {
    blocks.iter().find(|block| block.fields.is_none() && reaches_reader(block, reader))
}

pub fn blocked_fields(blocks: &[ReadingBlock], reader: &ReaderVersion, rat: Rat, role: Role) -> BlockedFields {
    let role = block_role(role);
    let mut fields = BlockedFields::default();
    for block in blocks {
        let reaches = reaches_reader(block, reader)
            && block.rats.as_ref().is_none_or(|rats| rats.contains(&rat))
            && block.roles.as_ref().is_none_or(|roles| roles.contains(&role));
        if !reaches {
            continue;
        }
        for &field in block.fields.iter().flatten() {
            let state = match field {
                BlockField::Pci => &mut fields.pci,
                BlockField::Channel => &mut fields.channel,
                BlockField::AreaCode => &mut fields.area_code,
                BlockField::Bandwidth => &mut fields.bandwidth,
                BlockField::TimingAdvance => &mut fields.timing_advance,
                BlockField::Signal => &mut fields.signal,
            };
            *state = state.reached_by(block, field);
        }
    }
    fields
}
