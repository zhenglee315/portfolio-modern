"""Import the portfolio-web mock into the migrated portfolio database.

From backend, run: uv run test.py
All portfolio tables must be empty. The auth_user table is left untouched.
"""

# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.database import CONN_MANAGER
from SYSTEM.models import (
    PortfolioLocale, PortfolioSite, PortfolioSiteLocale,
    PortfolioCareer, PortfolioCareerLocale,
    PortfolioProject, PortfolioProjectLocale,
    PortfolioSkill, PortfolioSkillLocale,
    PortfolioSkillCategory, PortfolioSkillCategoryLocale,
    PortfolioCategorySkill,
)

# ◆—< Pack >—————————————————————————————————◆ Sqlalchemy
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

# ◆—< Pack >—————————————————————————————————◆ Python
from argparse import ArgumentParser
from calendar import monthrange
from datetime import date
from pathlib import Path
import asyncio
import json
import re


BACKEND_DIR = Path(__file__).resolve().parent
DEFAULT_MOCK_DIR = BACKEND_DIR.parent.parent / 'portfolio-web' / 'mock'
LOCALE_NAMES = {'en': 'English', 'zh-Hans': '简体中文', 'zh-Hant': '繁體中文'}
PORTFOLIO_MODELS = (
    PortfolioLocale, PortfolioSite, PortfolioSiteLocale,
    PortfolioCareer, PortfolioCareerLocale,
    PortfolioProject, PortfolioProjectLocale,
    PortfolioSkill, PortfolioSkillLocale,
    PortfolioSkillCategory, PortfolioSkillCategoryLocale,
    PortfolioCategorySkill,
)


# ■—< MOCK >——————————————————————————————————————————————————————————————————————————■ Read
def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def read_json(path: Path):
    if not path.is_file():
        raise FileNotFoundError(f'Mock file not found: {path}')
    with path.open(encoding='utf-8') as stream:
        return json.load(stream)


def rows_by_id(rows: list[dict], source: str) -> dict[int, dict]:
    require(isinstance(rows, list), f'{source} must be an array.')
    result = {item['id']: item for item in rows}
    require(len(result) == len(rows), f'{source} contains duplicate IDs.')
    require(all(isinstance(key, int) and key > 0 for key in result),
            f'{source} needs positive integer IDs.')
    return result


def month(value: str | None) -> date | None:
    if value is None:
        return None
    require(isinstance(value, str) and re.fullmatch(r'\d{4}-(0[1-9]|1[0-2])', value) is not None,
            f'Invalid YYYY-MM month: {value!r}')
    return date.fromisoformat(f'{value}-01')


def check_end_day(end_month: str | None, end_day: int | None, source: str) -> None:
    if end_day is None:
        return
    end = month(end_month)
    require(end is not None and isinstance(end_day, int) and
            1 <= end_day <= monthrange(end.year, end.month)[1],
            f'{source} has an invalid endDay.')


def check_labels(value: list[str] | None, source: str, allow_null: bool = False) -> None:
    if allow_null and value is None:
        return
    require(isinstance(value, list) and all(isinstance(item, str) and item.strip() for item in value),
            f'{source} must be an array of nonblank strings.')


def project_detail(value: dict | str | None, source: str) -> dict:
    fields = ('workflowDescription', 'flow', 'technicalDescription', 'contribution', 'outcome')
    match value:
        case dict():
            require(all(field in value for field in fields), f'{source} is missing a detail field.')
            check_labels(value['flow'], f'{source}.flow', allow_null=True)
            return {
                'detail_kind': 'object',
                'workflow_description': value['workflowDescription'],
                'flow': value['flow'],
                'technical_description': value['technicalDescription'],
                'contribution': value['contribution'],
                'outcome': value['outcome'],
            }
        case None:
            return {'detail_kind': 'null'}
        case '':
            return {'detail_kind': 'empty'}
        case _:
            raise ValueError(f'{source} must be an object, null, or empty string.')


# ■—< MOCK >——————————————————————————————————————————————————————————————————————————■ Validate
def load_mock(mock_dir: Path) -> dict:
    data = {
        group: {
            locale: read_json(mock_dir / group / f'{locale}.json') for locale in LOCALE_NAMES
        }
        for group in ('site', 'journey', 'experiences', 'projects')
    }
    data['skills'] = read_json(mock_dir / 'skills.json')
    data['locales'] = {
        locale: read_json(mock_dir / 'locales' / f'{locale}.json') for locale in LOCALE_NAMES
    }

    # The API requires matching IDs and ordering in all three languages.
    for group in ('journey', 'experiences', 'projects'):
        english_order = [item['id'] for item in data[group]['en']]
        for locale, rows in data[group].items():
            rows_by_id(rows, f'{group}/{locale}')
            require([item['id'] for item in rows] == english_order,
                    f'{group}/{locale} differs in ID or array order.')

    journey_ids = set(rows_by_id(data['journey']['en'], 'journey/en'))
    experience_ids = set(rows_by_id(data['experiences']['en'], 'experiences/en'))
    project_ids = set(rows_by_id(data['projects']['en'], 'projects/en'))
    require(journey_ids == experience_ids, 'Journey and Experiences must share career IDs.')
    for group, ids in (('career', journey_ids), ('project', project_ids)):
        require(sorted(ids) == list(range(1, len(ids) + 1)),
                f'{group} IDs must start at 1 without gaps when database IDs are auto-generated.')

    english_site = data['site']['en']
    english_journey = rows_by_id(data['journey']['en'], 'journey/en')
    english_experiences = rows_by_id(data['experiences']['en'], 'experiences/en')
    english_projects = rows_by_id(data['projects']['en'], 'projects/en')
    for locale in LOCALE_NAMES:
        site = data['site'][locale]
        require(site['brand']['copyrightYear'] == english_site['brand']['copyrightYear'],
                f'site/{locale} has a different copyright year.')
        require(site['social'] == english_site['social'] and
                site['chatme']['icon'] == english_site['chatme']['icon'],
                f'site/{locale} differs in language-independent fields.')

        journey = rows_by_id(data['journey'][locale], f'journey/{locale}')
        experiences = rows_by_id(data['experiences'][locale], f'experiences/{locale}')
        for source_id, item in journey.items():
            experience = experiences[source_id]
            for field in (
                'countryCode', 'countryName', 'city', 'type', 'startMonth', 'endMonth',
                'endDay', 'organizationName', 'organizationCode', 'organizationTitle',
            ):
                require(item.get(field) == experience.get(field),
                        f'Career {source_id}/{locale} differs between Journey and Experiences: {field}.')
            require(item['expected'] == experience.get('expected', False) and
                    item.get('detail') == experience.get('detail'),
                    f'Career {source_id}/{locale} differs in expected or detail.')
            for field in (
                'countryCode', 'latitude', 'longitude', 'type',
                'startMonth', 'endMonth', 'endDay', 'expected',
            ):
                require(item.get(field) == english_journey[source_id].get(field),
                        f'Career {source_id}/{locale} differs in shared {field}.')
            require(experience['order'] == english_experiences[source_id]['order'],
                    f'Career {source_id}/{locale} has a different experience order.')
            check_end_day(item['endMonth'], item.get('endDay'), f'Career {source_id}/{locale}')
            check_labels(experience['skills'], f'Career {source_id}/{locale}.skills')
            detail = item.get('detail')
            if detail is not None:
                require(isinstance(detail, dict) and
                        all(key in detail for key in ('startMonth', 'endMonth', 'content')),
                        f'Career {source_id}/{locale} has incomplete detail.')
                english_detail = english_journey[source_id]['detail']
                for field in ('startMonth', 'endMonth', 'endDay'):
                    require(detail.get(field) == english_detail.get(field),
                            f'Career {source_id}/{locale} has a different detail period.')
                check_end_day(detail['endMonth'], detail.get('endDay'),
                              f'Career detail {source_id}/{locale}')

        for item in data['projects'][locale]:
            source_id = item['id']
            for field in ('startMonth', 'endMonth', 'expected'):
                require(item.get(field, False) == english_projects[source_id].get(field, False),
                        f'Project {source_id}/{locale} differs in shared {field}.')
            check_labels(item['skills'], f'Project {source_id}/{locale}.skills', allow_null=True)
            project_detail(item['detail'], f'Project {source_id}/{locale}.detail')

    skills = data['skills']['items']
    categories = data['skills']['categories']
    skill_ids = {item['id'] for item in skills}
    require(len(skill_ids) == len(skills), 'skills.json contains duplicate skill IDs.')
    require(len({item['id'] for item in categories}) == len(categories),
            'skills.json contains duplicate category IDs.')
    for category in categories:
        members = category['skillIds']
        require(len(members) == len(set(members)) and set(members) <= skill_ids,
                f"Category {category['id']} contains duplicate or unknown skill IDs.")
    for locale, labels in data['locales'].items():
        for item in (*skills, *categories):
            require(isinstance(labels.get(item['labelKey']), str),
                    f"locales/{locale} is missing {item['labelKey']}.")
    return data


# ■—< DATABASE >——————————————————————————————————————————————————————————————————————■ Import
async def require_empty(session: AsyncSession) -> None:
    populated = []
    for model in PORTFOLIO_MODELS:
        if await session.scalar(select(func.count()).select_from(model)):
            populated.append(model.__tablename__)
    require(not populated, 'Portfolio tables must be empty before import: ' + ', '.join(populated))


async def seed(session: AsyncSession, data: dict) -> dict[str, int]:
    await require_empty(session)

    # String keys come from mock. Integer primary keys are never assigned.
    for code, name in LOCALE_NAMES.items():
        session.add(PortfolioLocale(code=code, name=name, is_active=True))
    await session.flush()

    english_site = data['site']['en']
    site = PortfolioSite(
        copyright_year=english_site['brand']['copyrightYear'],
        linkedin=english_site['social']['linkedin'],
        github=english_site['social']['github'],
        medium=english_site['social']['medium'],
        email=english_site['social']['email'],
        chat_icon=english_site['chatme']['icon'],
    )
    session.add(site)
    await session.flush()

    journey_en = data['journey']['en']
    experience_en = rows_by_id(data['experiences']['en'], 'experiences/en')
    career_rows = {}
    for position, item in sorted(enumerate(journey_en), key=lambda pair: pair[1]['id']):
        detail = item.get('detail')
        career = PortfolioCareer(
            journey_position=position,
            experience_order=experience_en[item['id']]['order'],
            country_code=item['countryCode'],
            latitude=item['latitude'],
            longitude=item['longitude'],
            type=item['type'],
            start_month=month(item['startMonth']),
            end_month=month(item['endMonth']),
            end_day=item.get('endDay'),
            expected=item['expected'],
            detail_start_month=month(detail['startMonth']) if detail else None,
            detail_end_month=month(detail['endMonth']) if detail else None,
            detail_end_day=detail.get('endDay') if detail else None,
        )
        session.add(career)
        await session.flush()
        require(career.id == item['id'],
                f"Generated career ID {career.id} differs from mock ID {item['id']}; rolled back.")
        career_rows[item['id']] = career

    projects_en = data['projects']['en']
    project_rows = {}
    for position, item in sorted(enumerate(projects_en), key=lambda pair: pair[1]['id']):
        project = PortfolioProject(
            position=position,
            start_month=month(item['startMonth']),
            end_month=month(item['endMonth']),
            expected=item.get('expected', False),
        )
        session.add(project)
        await session.flush()
        require(project.id == item['id'],
                f"Generated project ID {project.id} differs from mock ID {item['id']}; rolled back.")
        project_rows[item['id']] = project

    skills = data['skills']['items']
    categories = data['skills']['categories']
    for item in skills:
        session.add(PortfolioSkill(id=item['id'], label_key=item['labelKey']))
    for position, item in enumerate(categories):
        session.add(PortfolioSkillCategory(
            id=item['id'], label_key=item['labelKey'], position=position
        ))
    await session.flush()

    # Child rows can now reference generated parent IDs.
    for locale in LOCALE_NAMES:
        source = data['site'][locale]
        profile = source['profile']
        session.add(PortfolioSiteLocale(
            site_id=site.id,
            locale=locale,
            brand_title=source['brand']['title'],
            brand_title_sub=source['brand']['titleSub'],
            first_name=profile['firstName'],
            family_name=profile['familyName'],
            nick_name=profile['nickName'],
            profile_content=profile['content'],
            edu_code=profile['eduCode'],
            program=profile['program'],
            intro_content=profile['introContent'],
            footer_content=profile['footerContent'],
            chat_title=source['chatme']['title'],
            chat_title_sub=source['chatme']['titleSub'],
            chat_content=source['chatme']['content'],
        ))

        for item in data['experiences'][locale]:
            detail = item.get('detail')
            session.add(PortfolioCareerLocale(
                career_id=career_rows[item['id']].id,
                locale=locale,
                country_name=item['countryName'],
                city=item['city'],
                organization_name=item['organizationName'],
                organization_code=item['organizationCode'],
                organization_title=item['organizationTitle'],
                content=item['content'],
                skills=item['skills'],
                detail_content=detail['content'] if detail else None,
            ))

        for item in data['projects'][locale]:
            session.add(PortfolioProjectLocale(
                project_id=project_rows[item['id']].id,
                locale=locale,
                organization_name=item['organizationName'],
                organization_code=item['organizationCode'],
                organization_title=item['organizationTitle'],
                project_name=item['projectName'],
                project_title=item['projectTitle'],
                intro=item['intro'],
                skills=item['skills'],
                **project_detail(item['detail'], f"Project {item['id']}/{locale}.detail"),
            ))

        labels = data['locales'][locale]
        for item in skills:
            session.add(PortfolioSkillLocale(
                skill_id=item['id'], locale=locale, label=labels[item['labelKey']]
            ))
        for item in categories:
            session.add(PortfolioSkillCategoryLocale(
                category_id=item['id'], locale=locale, label=labels[item['labelKey']]
            ))

    for category in categories:
        for position, skill_id in enumerate(category['skillIds']):
            session.add(PortfolioCategorySkill(
                category_id=category['id'], skill_id=skill_id, position=position
            ))
    await session.flush()

    expected = {
        'portfolio_locale': len(LOCALE_NAMES),
        'portfolio_site': 1,
        'portfolio_site_locale': len(LOCALE_NAMES),
        'portfolio_career': len(journey_en),
        'portfolio_career_locale': len(journey_en) * len(LOCALE_NAMES),
        'portfolio_project': len(projects_en),
        'portfolio_project_locale': len(projects_en) * len(LOCALE_NAMES),
        'portfolio_skill': len(skills),
        'portfolio_skill_locale': len(skills) * len(LOCALE_NAMES),
        'portfolio_skill_category': len(categories),
        'portfolio_skill_category_locale': len(categories) * len(LOCALE_NAMES),
        'portfolio_category_skill': sum(len(item['skillIds']) for item in categories),
    }
    for model in PORTFOLIO_MODELS:
        actual = await session.scalar(select(func.count()).select_from(model))
        require(actual == expected[model.__tablename__],
                f'{model.__tablename__}: expected {expected[model.__tablename__]}, found {actual}.')
    for model, per_locale in (
        (PortfolioSiteLocale, 1),
        (PortfolioCareerLocale, len(journey_en)),
        (PortfolioProjectLocale, len(projects_en)),
        (PortfolioSkillLocale, len(skills)),
        (PortfolioSkillCategoryLocale, len(categories)),
    ):
        result = await session.execute(select(model.locale, func.count()).group_by(model.locale))
        require(dict(result.all()) == dict.fromkeys(LOCALE_NAMES, per_locale),
                f'{model.__tablename__} has incomplete language rows.')
    result = await session.execute(select(PortfolioProject.id).order_by(PortfolioProject.position))
    require(result.scalars().all() == [item['id'] for item in projects_en],
            'Project display order differs from mock.')
    return expected


async def main(mock_dir: Path) -> None:
    data = load_mock(mock_dir)

    # Resolve SQLite relative to backend, the directory used for Alembic migration.
    url = CONN_MANAGER.get_db_url()
    if url.get_backend_name() == 'sqlite' and url.database != ':memory:':
        database_file = Path(url.database)
        if not database_file.is_absolute():
            database_file = BACKEND_DIR / database_file
        database_file = database_file.resolve()
        if not database_file.is_file():
            raise FileNotFoundError(f'Migrated SQLite database not found: {database_file}')
        CONN_MANAGER.db_conf['name'] = str(database_file)

    CONN_MANAGER.init_db()
    try:
        async with CONN_MANAGER.get_db() as session:
            async with session.begin():
                counts = await seed(session, data)
    finally:
        await CONN_MANAGER.shutdown_all_connections()

    print(f"[INFO] [test.py] Imported {sum(counts.values())} portfolio rows from {mock_dir}.")
    for table, count in counts.items():
        print(f'  {table}: {count}')
    print('[INFO] [test.py] auth_user was not modified; no account exists in the mock.')


if __name__ == '__main__':
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--mock-dir', type=Path, default=DEFAULT_MOCK_DIR)
    args = parser.parse_args()
    asyncio.run(main(args.mock_dir.resolve()))
