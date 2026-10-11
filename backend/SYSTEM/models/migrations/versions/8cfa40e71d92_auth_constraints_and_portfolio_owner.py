"""Enforce Auth constraints and portfolio ownership after data backfill.

Revision ID: 8cfa40e71d92
Revises: 3b85f19e2a60
Create Date: 2026-10-11

Roles, credentials and all existing site owners must be populated before this
revision. All existing portfolio content and constraints remain unchanged.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '8cfa40e71d92'
down_revision: Union[str, None] = '3b85f19e2a60'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Freeze validation rules here; historical revisions must not import current models.
_ROLE_WHITESPACE = ' \t\n\r\f\v\x1c-\x1f\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff'
_EMAIL_PATTERN = (
    r"\A[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@"
    r'[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?'
    r'(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+\Z'
)
_PASSWORD_PATTERN = (
    r'\A\$argon2id\$v=19\$m=[1-9][0-9]*,t=[1-9][0-9]*,p=[1-9][0-9]*' r'\$[A-Za-z0-9+/]{22,}\$[A-Za-z0-9+/]{43,}\Z'
)


def upgrade() -> None:
    role = sa.column('role')
    email = sa.column('email')
    password = sa.column('password')

    for column in (
        'role',
        'is_default',
        'is_create',
        'is_read',
        'is_update',
        'is_delete',
        'is_manage_roles',
        'is_manage_users',
        'is_active',
        'createtime',
        'updatetime',
    ):
        op.alter_column('auth_role', column, nullable=False)
    op.alter_column('auth_user', 'role_id', existing_type=sa.Integer(), nullable=False)
    op.alter_column('auth_user', 'is_active', existing_type=sa.Boolean(), nullable=False)

    op.create_unique_constraint('uq_auth_role_role', 'auth_role', ['role'])
    # Renaming preserves the existing email uniqueness and its backing index.
    op.execute(sa.text('ALTER TABLE auth_user RENAME CONSTRAINT uq_auth_user_account TO uq_auth_user_email'))
    op.create_check_constraint('ck_auth_role_id_positive', 'auth_role', sa.column('id') > 0)
    op.create_check_constraint(
        'ck_auth_role_role',
        'auth_role',
        sa.func.length(role).between(1, 64) & ~role.regexp_match(rf'\A[{_ROLE_WHITESPACE}]|[{_ROLE_WHITESPACE}]\Z'),
    )
    op.create_check_constraint(
        'ck_auth_role_default_no_management',
        'auth_role',
        'NOT is_default OR NOT (is_manage_roles OR is_manage_users)',
    )
    op.create_index(
        'uq_auth_role_one_default',
        'auth_role',
        ['is_default'],
        unique=True,
        postgresql_where=sa.text('is_default IS TRUE'),
    )
    op.create_check_constraint('ck_auth_user_id_positive', 'auth_user', sa.column('id') > 0)
    op.create_check_constraint('ck_auth_user_email_length', 'auth_user', sa.func.length(email).between(5, 254))
    op.create_check_constraint('ck_auth_user_email_local_length', 'auth_user', email.regexp_match(r'\A[^@]{1,64}@'))
    op.create_check_constraint('ck_auth_user_email_format', 'auth_user', email.regexp_match(_EMAIL_PATTERN))
    op.create_check_constraint(
        'ck_auth_user_password_hash_length', 'auth_user', sa.func.length(password).between(1, 255)
    )
    op.create_check_constraint(
        'ck_auth_user_password_hash_format', 'auth_user', password.regexp_match(_PASSWORD_PATTERN)
    )
    op.create_foreign_key(
        'fk_auth_user_role_id_auth_role', 'auth_user', 'auth_role', ['role_id'], ['id'], ondelete='RESTRICT'
    )
    op.create_index('ix_auth_user_role_id', 'auth_user', ['role_id'])

    op.alter_column('portfolio_site', 'user_id', existing_type=sa.Integer(), nullable=False)
    op.create_foreign_key(
        'fk_portfolio_site_user_id_auth_user', 'portfolio_site', 'auth_user', ['user_id'], ['id'], ondelete='RESTRICT'
    )
    op.create_index('ix_portfolio_site_user_id', 'portfolio_site', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_portfolio_site_user_id', table_name='portfolio_site')
    op.drop_constraint('fk_portfolio_site_user_id_auth_user', 'portfolio_site', type_='foreignkey')
    op.alter_column('portfolio_site', 'user_id', existing_type=sa.Integer(), nullable=True)
    op.drop_index('ix_auth_user_role_id', table_name='auth_user')
    op.drop_constraint('fk_auth_user_role_id_auth_role', 'auth_user', type_='foreignkey')
    for name in (
        'ck_auth_user_id_positive',
        'ck_auth_user_email_length',
        'ck_auth_user_email_local_length',
        'ck_auth_user_email_format',
        'ck_auth_user_password_hash_length',
        'ck_auth_user_password_hash_format',
    ):
        op.drop_constraint(name, 'auth_user', type_='check')
    op.execute(sa.text('ALTER TABLE auth_user RENAME CONSTRAINT uq_auth_user_email TO uq_auth_user_account'))
    op.alter_column('auth_user', 'role_id', existing_type=sa.Integer(), nullable=True)
    op.alter_column('auth_user', 'is_active', existing_type=sa.Boolean(), nullable=True)
    op.drop_index('uq_auth_role_one_default', table_name='auth_role')
    for name in ('ck_auth_role_id_positive', 'ck_auth_role_role', 'ck_auth_role_default_no_management'):
        op.drop_constraint(name, 'auth_role', type_='check')
    op.drop_constraint('uq_auth_role_role', 'auth_role', type_='unique')
    for column in (
        'role',
        'is_default',
        'is_create',
        'is_read',
        'is_update',
        'is_delete',
        'is_manage_roles',
        'is_manage_users',
        'is_active',
        'createtime',
        'updatetime',
    ):
        op.alter_column('auth_role', column, nullable=True)
