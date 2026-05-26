import streamlit as st

from sovereign.db import init_db
from sovereign.assignments import assign_vendor_to_estate, list_estate_vendor_assignments
from sovereign.estates import add_estate, list_estates
from sovereign.homewatch import list_homewatch_properties
from sovereign.vendor_audit import audit_website
from sovereign.vendors import add_vendor, list_vendors, update_vendor_audit


init_db()

st.set_page_config(
    page_title="Sovereign Ops Intelligence",
    page_icon="🏛️",
    layout="wide",
)

st.title("Sovereign Ops Intelligence")
st.caption("Private operations intelligence for luxury properties.")

module = st.sidebar.radio(
    "Module",
    [
        "Dashboard",
        "Vendor Intelligence",
        "Estate Command",
        "Naples HomeWatch",
    ],
)

if module == "Dashboard":
    st.header("Command Dashboard")

    vendors_df = list_vendors()
    estates_df = list_estates()
    homewatch_df = list_homewatch_properties()

    total_vendors = len(vendors_df)
    total_estates = len(estates_df)
    total_homewatch = len(homewatch_df)

    audited_vendors = 0

    if not vendors_df.empty and "website_audit_score" in vendors_df.columns:
        audited_vendors = int((vendors_df["website_audit_score"] > 0).sum())

    col1, col2, col3, col4 = st.columns(4)

    col1.metric("Vendors", total_vendors)
    col2.metric("Audited Vendors", audited_vendors)
    col3.metric("Estates", total_estates)
    col4.metric("HomeWatch Properties", total_homewatch)

    st.divider()

    st.subheader("Operational Alerts")

    if vendors_df.empty:
        st.info("No vendors yet.")
    else:
        low_score_vendors = vendors_df[
            (vendors_df["website_audit_score"] > 0)
            & (vendors_df["website_audit_score"] < 60)
        ]

        if low_score_vendors.empty:
            st.success("No low-score audited vendors.")
        else:
            st.warning("Low-score vendors need review.")
            st.dataframe(
                low_score_vendors[
                    ["company_name", "category", "website_audit_score"]
                ],
                use_container_width=True,
            )

    if not homewatch_df.empty:
        not_ready = homewatch_df[homewatch_df["hurricane_ready"] == 0]

        if not not_ready.empty:
            st.error("Some HomeWatch properties are not hurricane ready.")
            st.dataframe(
                not_ready[["property_name", "city", "inspection_frequency"]],
                use_container_width=True,
            )
        else:
            st.success("All HomeWatch properties marked hurricane ready.")

elif module == "Vendor Intelligence":
    st.header("Vendor Intelligence")

    with st.form("vendor_form"):
        st.subheader("Add Vendor")

        company_name = st.text_input("Company name")
        category = st.text_input("Category")
        service_area = st.text_input("Service area")
        website = st.text_input("Website")
        phone = st.text_input("Phone")
        email = st.text_input("Email")
        emergency_available = st.checkbox("Emergency available")
        license_status = st.text_input("License status")
        insurance_expiration = st.text_input("Insurance expiration")
        notes = st.text_area("Notes")

        submitted = st.form_submit_button("Save vendor")

    if submitted:
        if company_name:
            add_vendor(
                company_name,
                category,
                service_area,
                website,
                phone,
                email,
                emergency_available,
                license_status,
                insurance_expiration,
                notes,
            )
            st.success("Vendor saved.")
        else:
            st.error("Company name is required.")

    vendors_df = list_vendors()

    st.subheader("Vendor List")
    if vendors_df.empty:
        st.info("No vendors saved yet.")
    else:
        st.dataframe(vendors_df, use_container_width=True)

    st.subheader("Website Audit")

    if not vendors_df.empty:
        vendor_options = {
            f"{row['company_name']} - {row['id']}": row
            for _, row in vendors_df.iterrows()
        }

        selected_vendor_label = st.selectbox("Choose vendor", list(vendor_options.keys()))
        selected_vendor = vendor_options[selected_vendor_label]

        if st.button("Run and save website audit"):
            result = audit_website(selected_vendor["website"])
            st.json(result)

            if "error" not in result:
                update_vendor_audit(
                    int(selected_vendor["id"]),
                    int(result["score"]),
                    str(result),
                )
                st.success("Audit saved.")
    else:
        st.info("Add a vendor first.")

elif module == "Estate Command":
    st.header("Estate Command")
    st.write("Create and track luxury estate profiles.")

    with st.form("add_estate_form"):
        estate_name = st.text_input("Estate name")
        city = st.selectbox(
            "City",
            ["Miami", "Naples", "Palm Beach", "Coral Gables", "Key Biscayne", "Other"],
        )
        property_type = st.selectbox(
            "Property type",
            [
                "Single-family estate",
                "Penthouse",
                "Waterfront home",
                "Seasonal home",
                "Other",
            ],
        )
        estate_manager = st.text_input("Estate manager")
        emergency_contact = st.text_input("Emergency contact")
        notes = st.text_area("Notes")

        submitted = st.form_submit_button("Save estate")

        if submitted:
            if not estate_name:
                st.error("Estate name is required.")
            else:
                add_estate(
                    estate_name,
                    city,
                    property_type,
                    estate_manager,
                    emergency_contact,
                    notes,
                )
                st.success("Estate saved.")

    st.subheader("Estate Database")
    estates_df = list_estates()
    vendors_df = list_vendors()
    st.dataframe(estates_df, use_container_width=True)

    st.subheader("Assign Vendor to Estate")

    if estates_df.empty or vendors_df.empty:
        st.info("Add at least one estate and one vendor first.")
    else:
        estate_options = {
            f"{row['estate_name']} - {row['id']}": row
            for _, row in estates_df.iterrows()
        }
        vendor_options = {
            f"{row['company_name']} - {row['category']} - {row['id']}": row
            for _, row in vendors_df.iterrows()
        }

        with st.form("assign_vendor_form"):
            selected_estate_label = st.selectbox("Estate", list(estate_options.keys()))
            selected_vendor_label = st.selectbox("Vendor", list(vendor_options.keys()))
            role = st.text_input(
                "Vendor role",
                placeholder="Example: Primary HVAC emergency vendor",
            )
            assignment_notes = st.text_area("Assignment notes")

            submitted_assignment = st.form_submit_button("Assign vendor")

            if submitted_assignment:
                assign_vendor_to_estate(
                    int(estate_options[selected_estate_label]["id"]),
                    int(vendor_options[selected_vendor_label]["id"]),
                    role,
                    assignment_notes,
                )
                st.success("Vendor assigned to estate.")

    st.subheader("Estate Vendor Assignments")
    st.dataframe(list_estate_vendor_assignments(), use_container_width=True)

elif module == "Naples HomeWatch":
    st.header("Naples HomeWatch Command")
    st.write("Manage seasonal-home inspections, owner reports, and open issues.")
