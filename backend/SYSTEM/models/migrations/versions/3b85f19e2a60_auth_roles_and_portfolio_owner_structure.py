"""Prepare Auth roles and portfolio ownership for data backfill.

Revision ID: 3b85f19e2a60
Revises: c9da53f54cbd
Create Date: 2026-10-11

Upgrade to this revision first, populate roles, account credentials and site
owners, then upgrade to 8cfa40e71d92 to enforce the completed data. Credentials
belong in the execution environment, never in a migration file.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '3b85f19e2a60'
down_revision: Union[str, None] = 'c9da53f54cbd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'auth_role',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False, comment='Auto-incrementing primary key'),
        sa.Column('role', sa.String(64), nullable=True, comment='Unique role, e.g. admin, editor or viewer'),
        sa.Column('description', sa.Text(), nullable=True, comment='Descriptive text about the row content.'),
        sa.Column(
            'is_default',
            sa.Boolean(),
            nullable=True,
            server_default=sa.false(),
            comment='Default role for new registrations',
        ),
        sa.Column(
            'is_create',
            sa.Boolean(),
            nullable=True,
            server_default=sa.false(),
            comment='Allow creating portfolio content',
        ),
        sa.Column(
            'is_read',
            sa.Boolean(),
            nullable=True,
            server_default=sa.false(),
            comment='Allow reading portfolio management content',
        ),
        sa.Column(
            'is_update',
            sa.Boolean(),
            nullable=True,
            server_default=sa.false(),
            comment='Allow updating portfolio content',
        ),
        sa.Column(
            'is_delete',
            sa.Boolean(),
            nullable=True,
            server_default=sa.false(),
            comment='Allow deleting portfolio content',
        ),
        sa.Column(
            'is_manage_roles',
            sa.Boolean(),
            nullable=True,
            server_default=sa.false(),
            comment='Allow managing roles and registration defaults',
        ),
        sa.Column(
            'is_manage_users',
            sa.Boolean(),
            nullable=True,
            server_default=sa.false(),
            comment='Allow managing accounts and assigned roles',
        ),
        sa.Column(
            'is_active',
            sa.Boolean(),
            nullable=True,
            server_default=sa.true(),
            comment='True while enabled; false disables login for all accounts assigned to this role',
        ),
        sa.Column(
            'createtime',
            sa.DateTime(timezone=True),
            nullable=True,
            server_default=sa.func.now(),
            comment='UTC timestamp when the record was created',
        ),
        sa.Column(
            'updatetime',
            sa.DateTime(timezone=True),
            nullable=True,
            server_default=sa.func.now(),
            comment='UTC timestamp when the record was last updated',
        ),
        sa.PrimaryKeyConstraint('id'),
    )
    # Rename in place so existing IDs, emails, password hashes and timestamps survive.
    op.alter_column(
        'auth_user',
        'account',
        new_column_name='email',
        existing_type=sa.String(64),
        type_=sa.String(320),
        existing_nullable=False,
        comment='Unique login email; independent of the public portfolio email',
    )
    op.alter_column(
        'auth_user',
        'password',
        existing_type=sa.String(255),
        existing_nullable=False,
        comment='Salted Argon2id password hash; never plaintext',
    )
    op.add_column('auth_user', sa.Column('role_id', sa.Integer(), nullable=True, comment='Assigned role'))
    op.add_column(
        'auth_user',
        sa.Column(
            'is_active',
            sa.Boolean(),
            nullable=True,
            server_default=sa.true(),
            comment='True while active; false marks the account as soft-deleted',
        ),
    )
    for column in ('createtime', 'updatetime'):
        op.alter_column(
            'auth_user',
            column,
            existing_type=sa.DateTime(timezone=True),
            existing_nullable=False,
            server_default=sa.func.now(),
        )
    # Only this new ownership column changes an existing portfolio table.
    op.add_column(
        'portfolio_site',
        sa.Column('user_id', sa.Integer(), nullable=True, comment='Portfolio account owner'),
    )


def downgrade() -> None:
    if not op.get_context().as_sql:
        too_long = op.get_bind().scalar(sa.text('SELECT COUNT(*) FROM auth_user WHERE length(email) > 64'))
        if too_long:
            raise ValueError('Cannot restore account VARCHAR(64): existing login emails exceed 64 characters.')

    # Existing account rows survive; role, activation and ownership assignments do not.
    op.drop_column('portfolio_site', 'user_id')
    op.drop_column('auth_user', 'role_id')
    op.drop_column('auth_user', 'is_active')
    op.drop_table('auth_role')
    for column in ('createtime', 'updatetime'):
        op.alter_column(
            'auth_user',
            column,
            existing_type=sa.DateTime(timezone=True),
            existing_nullable=False,
            server_default=None,
        )
    op.alter_column(
        'auth_user',
        'password',
        existing_type=sa.String(255),
        existing_nullable=False,
        comment='Password hash; never plaintext',
    )
    op.alter_column(
        'auth_user',
        'email',
        new_column_name='account',
        existing_type=sa.String(320),
        type_=sa.String(64),
        existing_nullable=False,
        comment='Unique login account',
    )
