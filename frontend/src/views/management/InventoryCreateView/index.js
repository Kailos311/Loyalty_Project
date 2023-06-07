import React from 'react';
import { Container, makeStyles } from '@material-ui/core';
import Page from 'src/components/Page';
import Header from './Header';
import InventoryCreateForm from './InventoryCreateForm';

const useStyles = makeStyles((theme) => ({
  root: {
    backgroundColor: theme.palette.background.dark,
    minHeight: '100%',
    paddingTop: theme.spacing(3),
    paddingBottom: theme.spacing(3)
  }
}));

function InventoryCreateView() {
  const classes = useStyles();

  return (
    <Page
      className={classes.root}
      title="Inventory Create"
    >
      <Container maxWidth={false}>
        <Header />
        <InventoryCreateForm />
      </Container>
    </Page>
  );
}

export default InventoryCreateView;