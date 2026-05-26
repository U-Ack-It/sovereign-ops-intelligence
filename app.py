import streamlit as st


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
    st.info("MVP shell ready.")

elif module == "Vendor Intelligence":
    st.header("Vendor Intelligence")
    st.write("Audit and score service vendors.")

elif module == "Estate Command":
    st.header("Estate Command")
    st.write("Manage estate operations, vendors, incidents, and readiness.")

elif module == "Naples HomeWatch":
    st.header("Naples HomeWatch Command")
    st.write("Manage seasonal-home inspections, owner reports, and open issues.")
